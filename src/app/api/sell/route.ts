import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { db, client } from "@/lib/db";
import { initDatabase } from "@/lib/db/init";
import { medicines, batches, auditLogs, sales, patients, users } from "@/lib/db/schema";
import { eq, and, asc, gt, sql } from "drizzle-orm";
import { sendLowStockAlertEmail, recordStockRecovery } from "@/lib/emailService";

export async function POST(req: Request) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const shopId = Number(session.user?.shopId) || 1;
  const userId = parseInt(session.user.id);

  try {
    // Ensure schema (including patient columns) exists before touching sales/patients
    try {
      await initDatabase();
    } catch (e) {
      console.warn("DB init warning in sell POST:", e);
    }

    const body = await req.json();
    const {
      medicineId,
      quantity,
      unitPrice: customUnitPrice,
      batchId,
      discountPercent,
      patientName: rawPatientName,
      doctorName: rawDoctorName,
    } = body;

    const patientName = typeof rawPatientName === "string" ? rawPatientName.trim() : "";
    const doctorName = typeof rawDoctorName === "string" ? rawDoctorName.trim() : "";

    const medId = parseInt(medicineId);
    const requestedQty = parseInt(quantity);
    const targetBatchId = batchId ? parseInt(batchId) : null;
    const discPct = Math.max(0, Math.min(100, parseFloat(discountPercent) || 0));

    if (isNaN(medId) || isNaN(requestedQty) || requestedQty <= 0) {
      return NextResponse.json(
        { error: "Valid medicineId and positive quantity are required." },
        { status: 400 }
      );
    }

    // Verify medicine belongs to shop
    const [med] = await db
      .select()
      .from(medicines)
      .where(
        and(
          eq(medicines.id, medId),
          eq(medicines.shopId, shopId)
        )
      );

    if (!med) {
      return NextResponse.json(
        { error: "Medicine not found in your shop." },
        { status: 404 }
      );
    }

    const todayStr = new Date().toISOString().split("T")[0];

    // 1. Fetch all batches for medicine with quantity > 0 and shopId matching
    const allBatchesForMed = await db
      .select()
      .from(batches)
      .where(
        and(
          eq(batches.shopId, shopId),
          eq(batches.medicineId, medId),
          gt(batches.quantity, 0)
        )
      )
      .orderBy(asc(batches.expiryDate));

    // Separate valid unexpired stock vs expired stock
    let availableBatches = allBatchesForMed.filter((b) => b.expiryDate >= todayStr);
    const expiredBatches = allBatchesForMed.filter((b) => b.expiryDate < todayStr);

    // If a target batchId is explicitly selected by the user, prioritize it
    if (targetBatchId && !isNaN(targetBatchId)) {
      availableBatches = [...availableBatches].sort((a, b) => {
        if (a.id === targetBatchId) return -1;
        if (b.id === targetBatchId) return 1;
        return 0;
      });
    }

    if (availableBatches.length === 0 && expiredBatches.length > 0) {
      const expiredSample = expiredBatches[0];
      return NextResponse.json(
        {
          error: `Cannot dispense expired stock! All available stock for ${med.name} is EXPIRED (Batch ${expiredSample.batchNumber} expired on ${expiredSample.expiryDate}). Expired medicines cannot be sold to patients. Please log under Wastage.`,
          isExpiredError: true,
        },
        { status: 400 }
      );
    }

    // Determine effective selling unit price
    const passedPrice = parseFloat(customUnitPrice);
    const fallbackPrice = allBatchesForMed.length > 0 ? (allBatchesForMed[0].costPrice || 0) : 0;
    const effectiveUnitPrice = !isNaN(passedPrice) && passedPrice > 0
      ? passedPrice
      : (med.unitPrice > 0 ? med.unitPrice : fallbackPrice);

    // Update medicine unit price in database if it was updated or previously zero
    if (effectiveUnitPrice > 0 && med.unitPrice !== effectiveUnitPrice) {
      await db.update(medicines).set({ unitPrice: effectiveUnitPrice }).where(eq(medicines.id, med.id));
    }

    // 3. Sum total available valid unexpired stock
    const totalAvailable = availableBatches.reduce((sum, b) => sum + b.quantity, 0);

    if (totalAvailable < requestedQty) {
      return NextResponse.json(
        {
          error: `Insufficient stock! Requested ${requestedQty} units, but only ${totalAvailable} units available in stock.`,
          totalAvailable,
          requestedQty,
        },
        { status: 400 }
      );
    }

    // 4. Handle Patient record creation/linking if patientName provided
    let patientId: number | null = null;
    if (patientName) {
      try {
        const existingPatients = await db
          .select()
          .from(patients)
          .where(and(eq(patients.shopId, shopId), sql`LOWER(${patients.name}) = LOWER(${patientName})`));

        if (existingPatients.length > 0) {
          patientId = existingPatients[0].id;
        } else {
          try {
            await client.execute({
              sql: "INSERT INTO patients (shop_id, name) VALUES (?, ?)",
              args: [shopId, patientName],
            });
          } catch (e) {
            console.warn("Patient direct insert warning:", e);
          }

          const newPatients = await db
            .select()
            .from(patients)
            .where(and(eq(patients.shopId, shopId), sql`LOWER(${patients.name}) = LOWER(${patientName})`));

          if (newPatients.length > 0) {
            patientId = newPatients[0].id;
          }
        }
      } catch (err) {
        console.warn("Failed to register patient record:", err);
      }
    }

    // 5. Iterate through sorted batches and deduct FEFO
    let remainingToDeduct = requestedQty;
    const deductions: Array<{
      batchId: number;
      batchNumber: string;
      expiryDate: string;
      supplier: string;
      deductedQuantity: number;
      newBatchQuantity: number;
    }> = [];

    for (const batchItem of availableBatches) {
      if (remainingToDeduct <= 0) break;

      const takeFromThisBatch = Math.min(batchItem.quantity, remainingToDeduct);
      const newQty = batchItem.quantity - takeFromThisBatch;
      remainingToDeduct -= takeFromThisBatch;

      // Update batch in database
      await db
        .update(batches)
        .set({ quantity: newQty })
        .where(eq(batches.id, batchItem.id));

      deductions.push({
        batchId: batchItem.id,
        batchNumber: batchItem.batchNumber,
        expiryDate: batchItem.expiryDate,
        supplier: batchItem.supplier,
        deductedQuantity: takeFromThisBatch,
        newBatchQuantity: newQty,
      });
    }

    // Financial Calculation with Discount
    const subtotal = requestedQty * effectiveUnitPrice;
    const discountAmount = Math.round((subtotal * (discPct / 100)) * 100) / 100;
    const totalSaleAmount = Math.round((subtotal - discountAmount) * 100) / 100;
    const nowIsoTimestamp = new Date().toISOString();

    // 6. Validate Foreign Keys & Record sale entry into sales table
    let safeUserId: number | null = !isNaN(userId) ? userId : null;
    if (safeUserId) {
      try {
        const u = await db.select({ id: users.id }).from(users).where(eq(users.id, safeUserId));
        if (u.length === 0) safeUserId = null;
      } catch (e) {
        safeUserId = null;
      }
    }

    let safePatientId: number | null = patientId;
    if (safePatientId) {
      try {
        const p = await db.select({ id: patients.id }).from(patients).where(eq(patients.id, safePatientId));
        if (p.length === 0) safePatientId = null;
      } catch (e) {
        safePatientId = null;
      }
    }

    try {
      await db.insert(sales).values({
        shopId,
        userId: safeUserId,
        patientId: safePatientId,
        patientName: patientName || null,
        doctorName: doctorName || null,
        medicineId: med.id,
        medicineName: med.name,
        quantity: requestedQty,
        unitPrice: effectiveUnitPrice,
        subtotal,
        discountPercent: discPct,
        discountAmount,
        totalPrice: totalSaleAmount,
        batchDetails: JSON.stringify(deductions),
        createdAt: nowIsoTimestamp,
      });
    } catch (e) {
      console.warn("Drizzle sales table insertion failed, executing raw SQL fallback:", e);
      try {
        await client.execute({
          sql: `INSERT INTO sales (
            shop_id, user_id, patient_id, patient_name, doctor_name,
            medicine_id, medicine_name, quantity, unit_price, subtotal,
            discount_percent, discount_amount, total_price, batch_details, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            shopId,
            safeUserId,
            safePatientId,
            patientName || null,
            doctorName || null,
            med.id,
            med.name,
            requestedQty,
            effectiveUnitPrice,
            subtotal,
            discPct,
            discountAmount,
            totalSaleAmount,
            JSON.stringify(deductions),
            nowIsoTimestamp,
          ],
        });
      } catch (sqlErr) {
        console.error("Critical: Raw SQL sales insertion failed:", sqlErr);
      }
    }

    // 7. Write audit log entry
    await db.insert(auditLogs).values({
      shopId,
      userId,
      action: "SELL",
      entityType: "medicine",
      entityId: med.id,
      detail: JSON.stringify({
        medicineName: med.name,
        requestedQuantity: requestedQty,
        patientName: patientName || undefined,
        doctorName: doctorName || undefined,
        unitPrice: effectiveUnitPrice,
        subtotal,
        discountPercent: discPct,
        discountAmount,
        totalSaleAmount,
        deductions,
        timestamp: nowIsoTimestamp,
      }),
      timestamp: nowIsoTimestamp,
    });

    // 8. Calculate total remaining stock across all valid unexpired batches for this medicine
    const updatedBatches = await db
      .select()
      .from(batches)
      .where(
        and(
          eq(batches.shopId, shopId),
          eq(batches.medicineId, med.id),
          gt(batches.quantity, 0)
        )
      );

    const remainingStock = updatedBatches
      .filter((b) => b.expiryDate >= todayStr)
      .reduce((sum, b) => sum + b.quantity, 0);

    let lowStockAlertTriggered = false;

    if (remainingStock <= med.reorderThreshold) {
      lowStockAlertTriggered = true;

      // Build a brief batch summary for the email body
      const batchSummary = deductions
        .map((d) => `Batch ${d.batchNumber} (exp. ${d.expiryDate}): ${d.newBatchQuantity} units remaining`)
        .join("; ");

      // Await the email so Vercel does not kill the function before Brevo responds
      await sendLowStockAlertEmail({
        shopId,
        medicineName: med.name,
        currentStock: remainingStock,
        reorderThreshold: med.reorderThreshold,
        manufacturer: med.manufacturer,
        batchInfo: batchSummary || undefined,
      });
    } else {
      // Stock is above threshold — insert a RECOVERY marker so the next
      // drop below threshold triggers a fresh alert (not a suppressed duplicate).
      const settings = await import("@/lib/emailService").then((m) =>
        m.getShopAlertSettings(shopId)
      );
      if (settings.alertEmail) {
        await recordStockRecovery({
          shopId,
          medicineName: med.name,
          currentStock: remainingStock,
          reorderThreshold: med.reorderThreshold,
          recipientEmail: settings.alertEmail,
        });
      }
    }

    // 9. Return comprehensive deduction & financial receipt
    return NextResponse.json({
      success: true,
      medicineName: med.name,
      requestedQuantity: requestedQty,
      patientName: patientName || null,
      doctorName: doctorName || null,
      unitPrice: effectiveUnitPrice,
      subtotal,
      discountPercent: discPct,
      discountAmount,
      totalPrice: totalSaleAmount,
      deductions,
      remainingStock,
      reorderThreshold: med.reorderThreshold,
      lowStockAlertTriggered,
      createdAt: nowIsoTimestamp,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Sell dispense failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}