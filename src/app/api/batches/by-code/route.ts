import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { medicines, batches, auditLogs, shops, users } from "@/lib/db/schema";
import { eq, and, gt } from "drizzle-orm";
import { autoClassifySchedule } from "@/lib/scheduleClassifier";
import { persistCurrentDatabaseState, syncAndRestoreDatabase } from "@/lib/db/storeSync";
import { lookupBarcodeDetails } from "@/lib/barcodeLookup";
import { lookupBarcodeWithFallback } from "@/lib/server/barcodeLookupServer";
import { recordStockRecovery, getShopAlertSettings } from "@/lib/emailService";

function suggestNextBatchNumber(batchNumbers: string[]): string {
  let maxNum = 0;
  for (const b of batchNumbers) {
    const match = b.match(/(\d+)/);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxNum) maxNum = num;
    }
  }
  const nextNum = maxNum + 1;
  const padded = nextNum.toString().padStart(3, "0");
  return `BATCH-${padded}`;
}

export async function GET(req: Request) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const shopId = session.user.shopId;
  const { searchParams } = new URL(req.url);
  const barcode = searchParams.get("barcode")?.trim();

  if (!barcode) {
    return NextResponse.json({ error: "Barcode query parameter is required." }, { status: 400 });
  }

  try {
    const lookupResult = await lookupBarcodeWithFallback(barcode, shopId);

    if (lookupResult.found && lookupResult.medicine.id > 0) {
      const medBatches = await db
        .select()
        .from(batches)
        .where(
          and(
            eq(batches.shopId, shopId),
            eq(batches.medicineId, lookupResult.medicine.id)
          )
        );

      const existingBatchNumbers = medBatches.map((b) => b.batchNumber);
      const suggestedBatchNumber = suggestNextBatchNumber(existingBatchNumbers);

      return NextResponse.json({
        isNew: lookupResult.isNew,
        medicine: lookupResult.medicine,
        suggestedBatchNumber,
        existingBatchesCount: medBatches.length,
      });
    }

    return NextResponse.json({
      isNew: true,
      medicine: lookupResult.medicine,
      suggestedBatchNumber: "BATCH-001",
      existingBatchesCount: 0,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Lookup failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const shopId = session.user.shopId;
  const userId = parseInt(session.user.id);

  try {
    const body = await req.json();
    const {
      barcode,
      medicineName,
      category,
      manufacturer,
      schedule,
      price,
      batchNumber,
      quantity,
      expiryDate,
      supplier,
      costPrice,
      receivedDate,
    } = body;

    if (!barcode || quantity === undefined || !expiryDate || !supplier) {
      return NextResponse.json(
        { error: "Barcode, quantity, expiry date, and supplier are required." },
        { status: 400 }
      );
    }

    // Ensure shop record exists for foreign key constraint safety
    const [existingShop] = await db.select().from(shops).where(eq(shops.id, shopId));
    if (!existingShop) {
      await db.insert(shops).values({
        id: shopId,
        name: "Apex MedTrack Pharmacy",
        address: "123 Health Ave",
        phone: "+1-800-555-MEDS",
      });
    }

    // Auto-resolve or create medicine
    let [med] = await db
      .select()
      .from(medicines)
      .where(
        and(
          eq(medicines.shopId, shopId),
          eq(medicines.barcode, barcode.trim())
        )
      );

    const parsedCostPrice = parseFloat(costPrice) || 0;
    const parsedPrice = parseFloat(price) || 0;
    const newPriceToUse = parsedPrice > 0 ? parsedPrice : parsedCostPrice;

    if (!med) {
      const nameToUse = medicineName?.trim() || `Medicine (${barcode.trim()})`;
      const autoSchedule = (schedule && schedule.trim() !== "OTC") 
        ? schedule.trim() 
        : autoClassifySchedule(nameToUse);

      [med] = await db
        .insert(medicines)
        .values({
          shopId,
          barcode: barcode.trim(),
          name: nameToUse,
          manufacturer: manufacturer?.trim() || "General Pharma",
          schedule: autoSchedule,
          unitPrice: newPriceToUse,
        })
        .returning();
    } else if (med.unitPrice === 0 && newPriceToUse > 0) {
      await db.update(medicines).set({ unitPrice: newPriceToUse }).where(eq(medicines.id, med.id));
      med.unitPrice = newPriceToUse;
    }

    const existingBatches = await db
      .select()
      .from(batches)
      .where(
        and(
          eq(batches.shopId, shopId),
          eq(batches.medicineId, med.id)
        )
      );

    const finalBatchNumber =
      batchNumber?.trim() ||
      suggestNextBatchNumber(existingBatches.map((b) => b.batchNumber));

    const qty = parseInt(quantity);
    if (isNaN(qty) || qty < 0) {
      return NextResponse.json(
        { error: "Quantity must be a non-negative integer." },
        { status: 400 }
      );
    }

    const todayStr = new Date().toISOString().split("T")[0];

    const [newBatch] = await db
      .insert(batches)
      .values({
        shopId,
        medicineId: med.id,
        batchNumber: finalBatchNumber,
        quantity: qty,
        expiryDate: expiryDate.trim(),
        supplier: supplier.trim(),
        costPrice: parseFloat(costPrice) || 0,
        receivedDate: receivedDate ? receivedDate.trim() : todayStr,
      })
      .returning();

    // Ensure user record exists for foreign key constraint safety in audit_logs
    if (userId) {
      const [existingUser] = await db.select().from(users).where(eq(users.id, userId));
      if (!existingUser) {
        await db.insert(users).values({
          id: userId,
          shopId,
          name: session.user.name || "Staff Member",
          email: session.user.email || `staff_${userId}@medtrack.com`,
          passwordHash: "$2a$12$DummyHashForDemoUserOnly1234567890",
          role: session.user.role || "pharmacist",
        });
      }
    }

    // Audit log
    await db.insert(auditLogs).values({
      shopId,
      userId,
      action: "STOCK_IN",
      entityType: "batch",
      entityId: newBatch.id,
      detail: JSON.stringify({
        medicineName: med.name,
        barcode: med.barcode,
        batchNumber: newBatch.batchNumber,
        quantity: newBatch.quantity,
        expiryDate: newBatch.expiryDate,
        supplier: newBatch.supplier,
      }),
    });

    // After stocking in via barcode scanner, check if the medicine is now above
    // its reorder threshold.  If so, insert a RECOVERY marker so the next stock
    // drop triggers a fresh low-stock email (instead of being suppressed as a
    // duplicate of an earlier alert).
    if (med.reorderThreshold > 0) {
      const todayStr = new Date().toISOString().split("T")[0];

      const allBatches = await db
        .select()
        .from(batches)
        .where(
          and(
            eq(batches.shopId, shopId),
            eq(batches.medicineId, med.id),
            gt(batches.quantity, 0)
          )
        );

      const totalStock = allBatches
        .filter((b) => b.expiryDate >= todayStr)
        .reduce((sum, b) => sum + b.quantity, 0);

      if (totalStock > med.reorderThreshold) {
        const settings = await getShopAlertSettings(shopId);
        if (settings.alertEmail) {
          await recordStockRecovery({
            shopId,
            medicineName: med.name,
            currentStock: totalStock,
            reorderThreshold: med.reorderThreshold,
            recipientEmail: settings.alertEmail,
          });
        }
      }
    }

    return NextResponse.json(
      {
        batch: newBatch,
        medicine: med,
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Stock in failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const session = await getAuthSession();
  const shopId = session?.user?.shopId || 1;
  const userId = session?.user?.id || 1;
  const todayStr = new Date().toISOString().split("T")[0];
  const nextYearStr = new Date(Date.now() + 365 * 86400000).toISOString().split("T")[0];

  try {
    const { barcode, batchNumber, expiryDate, quantity, supplier } = await req.json();

    if (!barcode) {
      return NextResponse.json({ error: "Barcode is required" }, { status: 400 });
    }

    let [med] = await db
      .select()
      .from(medicines)
      .where(and(eq(medicines.shopId, shopId), eq(medicines.barcode, barcode)));

    if (!med) {
      const generatedName = `Scanned Medicine (${barcode.slice(-6)})`;
      const detectedSchedule = autoClassifySchedule(generatedName);
      const [newMed] = await db
        .insert(medicines)
        .values({
          shopId,
          name: generatedName,
          barcode,
          manufacturer: "General Pharma",
          schedule: detectedSchedule,
          unitPrice: 25.0,
          reorderThreshold: 10,
        })
        .returning();
      med = newMed;
    }

    const existingBatches = await db
      .select({ batchNumber: batches.batchNumber })
      .from(batches)
      .where(and(eq(batches.shopId, shopId), eq(batches.medicineId, med.id)));

    const finalBatchNumber =
      batchNumber || suggestNextBatchNumber(existingBatches.map((b) => b.batchNumber));

    const finalQuantity = quantity || 100;
    const finalExpiryDate = expiryDate || nextYearStr;
    const finalSupplier = supplier || "Mobile Delivery Wholesaler";

    const [newBatch] = await db
      .insert(batches)
      .values({
        shopId,
        medicineId: med.id,
        batchNumber: finalBatchNumber,
        quantity: finalQuantity,
        expiryDate: finalExpiryDate,
        supplier: finalSupplier,
        costPrice: 15.0,
        receivedDate: todayStr,
      })
      .returning();

    await persistCurrentDatabaseState();

    return NextResponse.json({ success: true, medicine: med, batch: newBatch });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Auto stock failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
