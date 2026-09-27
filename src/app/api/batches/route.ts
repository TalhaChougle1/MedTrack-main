import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { batches, medicines, auditLogs } from "@/lib/db/schema";
import { eq, and, asc, gt, sql } from "drizzle-orm";
import { recordStockRecovery, getShopAlertSettings } from "@/lib/emailService";

export async function GET() {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const shopId = session.user.shopId;

  try {
    const list = await db
      .select({
        id: batches.id,
        shopId: batches.shopId,
        medicineId: batches.medicineId,
        medicineName: medicines.name,
        medicineBarcode: medicines.barcode,
        medicineSchedule: medicines.schedule,
        batchNumber: batches.batchNumber,
        quantity: batches.quantity,
        expiryDate: batches.expiryDate,
        supplier: batches.supplier,
        costPrice: batches.costPrice,
        receivedDate: batches.receivedDate,
      })
      .from(batches)
      .innerJoin(medicines, eq(batches.medicineId, medicines.id))
      .where(eq(batches.shopId, shopId))
      .orderBy(asc(batches.expiryDate));

    return NextResponse.json(list);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to fetch batches";
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
      medicineId,
      batchNumber,
      quantity,
      expiryDate,
      supplier,
      costPrice,
      receivedDate,
    } = body;

    if (!medicineId || !batchNumber || quantity === undefined || !expiryDate || !supplier) {
      return NextResponse.json(
        { error: "Medicine, batch number, quantity, expiry date, and supplier are required." },
        { status: 400 }
      );
    }

    const qty = parseInt(quantity);
    if (isNaN(qty) || qty < 0) {
      return NextResponse.json(
        { error: "Quantity must be a non-negative integer." },
        { status: 400 }
      );
    }

    // Verify medicine belongs to this shop
    const [med] = await db
      .select()
      .from(medicines)
      .where(
        and(
          eq(medicines.id, parseInt(medicineId)),
          eq(medicines.shopId, shopId)
        )
      );

    if (!med) {
      return NextResponse.json(
        { error: "Medicine not found in your shop." },
        { status: 404 }
      );
    }

    const parsedCostPrice = parseFloat(costPrice) || 0;
    if (med.unitPrice === 0 && parsedCostPrice > 0) {
      await db.update(medicines).set({ unitPrice: parsedCostPrice }).where(eq(medicines.id, med.id));
      med.unitPrice = parsedCostPrice;
    }

    const todayStr = new Date().toISOString().split("T")[0];

    const [newBatch] = await db
      .insert(batches)
      .values({
        shopId,
        medicineId: med.id,
        batchNumber: batchNumber.trim(),
        quantity: qty,
        expiryDate: expiryDate.trim(),
        supplier: supplier.trim(),
        costPrice: parseFloat(costPrice) || 0,
        receivedDate: receivedDate ? receivedDate.trim() : todayStr,
      })
      .returning();

    // Audit log entry
    await db.insert(auditLogs).values({
      shopId,
      userId,
      action: "STOCK_IN",
      entityType: "batch",
      entityId: newBatch.id,
      detail: JSON.stringify({
        medicineName: med.name,
        batchNumber: newBatch.batchNumber,
        quantity: newBatch.quantity,
        expiryDate: newBatch.expiryDate,
        supplier: newBatch.supplier,
      }),
    });

    // After stocking in, check if the medicine is now above its threshold.
    // If so, insert a RECOVERY marker so the next stock drop triggers a fresh
    // low-stock email instead of being suppressed as a duplicate.
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

    return NextResponse.json(newBatch, { status: 201 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to add batch";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
