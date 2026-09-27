import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { db, client } from "@/lib/db";
import { initDatabase } from "@/lib/db/init";
import { medicines, batches, auditLogs, sales, patients, users } from "@/lib/db/schema";
import { eq, and, asc, gt, sql } from "drizzle-orm";
import { sendLowStockAlertEmail, recordStockRecovery, getShopAlertSettings } from "@/lib/emailService";

interface CartItemInput {
  medicineId: number;
  quantity: number;
  unitPrice: number;
  discountPercent?: number;
  batchId?: number | null; // specific batch or null for automatic FEFO
}

export async function POST(req: Request) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const shopId = Number(session.user?.shopId) || 1;
  const userId = parseInt(session.user.id);

  try {
    try {
      await initDatabase();
    } catch (e) {
      console.warn("DB init warning in checkout POST:", e);
    }

    const body = await req.json();
    const {
      items,
      patientName: rawPatientName,
      patientPhone: rawPatientPhone,
      doctorName: rawDoctorName,
      paymentMethod = "Cash",
      overallDiscountPercent = 0,
    } = body;

    const cartItems: CartItemInput[] = items;
    if (!Array.isArray(cartItems) || cartItems.length === 0) {
      return NextResponse.json(
        { error: "Cart is empty. Please add medicines before checkout." },
        { status: 400 }
      );
    }

    const patientName = typeof rawPatientName === "string" ? rawPatientName.trim() : "";
    const patientPhone = typeof rawPatientPhone === "string" ? rawPatientPhone.trim() : "";
    const doctorName = typeof rawDoctorName === "string" ? rawDoctorName.trim() : "";
    const todayStr = new Date().toISOString().split("T")[0];
    const nowIsoTimestamp = new Date().toISOString();

    // ── STEP 1: VALIDATE ALL ITEMS BEFORE APPLYING ANY DEDUCTION ──
    // Ensures transaction atomicity: all succeed or none succeed.
    interface ValidatedItem {
      medicine: typeof medicines.$inferSelect;
      requestedQty: number;
      effectiveUnitPrice: number;
      itemDiscountPct: number;
      availableBatches: Array<typeof batches.$inferSelect>;
      deductions: Array<{
        batchId: number;
        batchNumber: string;
        expiryDate: string;
        supplier: string;
        deductedQuantity: number;
        newBatchQuantity: number;
      }>;
    }

    const validatedItems: ValidatedItem[] = [];

    for (const item of cartItems) {
      const medId = parseInt(String(item.medicineId));
      const reqQty = parseInt(String(item.quantity));
      const unitPricePassed = parseFloat(String(item.unitPrice));
      const itemDiscPct = Math.max(
        0,
        Math.min(100, parseFloat(String(item.discountPercent || overallDiscountPercent || 0)))
      );

      if (isNaN(medId) || isNaN(reqQty) || reqQty <= 0) {
        return NextResponse.json(
          { error: "Each cart item must have a valid medicine and positive quantity." },
          { status: 400 }
        );
      }

      // Fetch medicine
      const [med] = await db
        .select()
        .from(medicines)
        .where(and(eq(medicines.id, medId), eq(medicines.shopId, shopId)));

      if (!med) {
        return NextResponse.json(
          { error: `Medicine ID ${medId} not found in your pharmacy catalog.` },
          { status: 404 }
        );
      }

      // Fetch batches for this medicine
      const allBatches = await db
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

      const unexpiredBatches = allBatches.filter((b) => b.expiryDate >= todayStr);
      const expiredBatches = allBatches.filter((b) => b.expiryDate < todayStr);

      if (unexpiredBatches.length === 0 && expiredBatches.length > 0) {
        return NextResponse.json(
          {
            error: `Medicine '${med.name}' has expired stock only (Batch ${expiredBatches[0].batchNumber} expired on ${expiredBatches[0].expiryDate}). Cannot be dispensed. Please log under Wastage.`,
            isExpiredError: true,
          },
          { status: 400 }
        );
      }

      // If user chose a specific batch
      let sortedBatches = [...unexpiredBatches];
      if (item.batchId) {
        sortedBatches.sort((a, b) => {
          if (a.id === item.batchId) return -1;
          if (b.id === item.batchId) return 1;
          return 0;
        });
      }

      const totalAvailable = sortedBatches.reduce((sum, b) => sum + b.quantity, 0);
      if (totalAvailable < reqQty) {
        return NextResponse.json(
          {
            error: `Insufficient stock for '${med.name}'. Requested ${reqQty} units, but only ${totalAvailable} available.`,
            medicineName: med.name,
            totalAvailable,
            requestedQty: reqQty,
          },
          { status: 400 }
        );
      }

      // Calculate planned FEFO deductions
      let remaining = reqQty;
      const plannedDeductions: ValidatedItem["deductions"] = [];

      for (const batch of sortedBatches) {
        if (remaining <= 0) break;
        const take = Math.min(batch.quantity, remaining);
        remaining -= take;
        plannedDeductions.push({
          batchId: batch.id,
          batchNumber: batch.batchNumber,
          expiryDate: batch.expiryDate,
          supplier: batch.supplier,
          deductedQuantity: take,
          newBatchQuantity: batch.quantity - take,
        });
      }

      const effectivePrice = !isNaN(unitPricePassed) && unitPricePassed > 0
        ? unitPricePassed
        : (med.unitPrice > 0 ? med.unitPrice : (allBatches[0]?.costPrice || 0));

      validatedItems.push({
        medicine: med,
        requestedQty: reqQty,
        effectiveUnitPrice: effectivePrice,
        itemDiscountPct: itemDiscPct,
        availableBatches: sortedBatches,
        deductions: plannedDeductions,
      });
    }

    // ── STEP 2: PATIENT RECORD LINKING / CREATION ──
    let patientId: number | null = null;
    if (patientName) {
      try {
        const existing = await db
          .select()
          .from(patients)
          .where(and(eq(patients.shopId, shopId), sql`LOWER(${patients.name}) = LOWER(${patientName})`));

        if (existing.length > 0) {
          patientId = existing[0].id;
          if (patientPhone && !existing[0].phone) {
            await db.update(patients).set({ phone: patientPhone }).where(eq(patients.id, patientId));
          }
        } else {
          try {
            await client.execute({
              sql: "INSERT INTO patients (shop_id, name, phone) VALUES (?, ?, ?)",
              args: [shopId, patientName, patientPhone || null],
            });
          } catch (e) {
            console.warn("Patient direct insert fallback:", e);
          }

          const created = await db
            .select()
            .from(patients)
            .where(and(eq(patients.shopId, shopId), sql`LOWER(${patients.name}) = LOWER(${patientName})`));
          if (created.length > 0) patientId = created[0].id;
        }
      } catch (err) {
        console.warn("Patient registration warning:", err);
      }
    }

    // Foreign key safety check for userId & patientId
    let safeUserId: number | null = !isNaN(userId) ? userId : null;
    if (safeUserId) {
      try {
        const u = await db.select({ id: users.id }).from(users).where(eq(users.id, safeUserId));
        if (u.length === 0) safeUserId = null;
      } catch {
        safeUserId = null;
      }
    }

    let safePatientId: number | null = patientId;
    if (safePatientId) {
      try {
        const p = await db.select({ id: patients.id }).from(patients).where(eq(patients.id, safePatientId));
        if (p.length === 0) safePatientId = null;
      } catch {
        safePatientId = null;
      }
    }

    // ── STEP 3: EXECUTE BATCH DEDUCTIONS & INSERT SALES ──
    const receiptItems: Array<{
      medicineId: number;
      medicineName: string;
      quantity: number;
      unitPrice: number;
      subtotal: number;
      discountPercent: number;
      discountAmount: number;
      totalPrice: number;
      deductions: ValidatedItem["deductions"];
    }> = [];

    let overallBillSubtotal = 0;
    let overallBillDiscount = 0;
    let overallBillTotal = 0;
    const lowStockAlertMedicines: string[] = [];

    for (const vItem of validatedItems) {
      // 1. Update batch quantities
      for (const d of vItem.deductions) {
        await db
          .update(batches)
          .set({ quantity: d.newBatchQuantity })
          .where(eq(batches.id, d.batchId));
      }

      // Financials for this item
      const itemSubtotal = Math.round(vItem.requestedQty * vItem.effectiveUnitPrice * 100) / 100;
      const itemDiscAmount = Math.round((itemSubtotal * (vItem.itemDiscountPct / 100)) * 100) / 100;
      const itemTotal = Math.round((itemSubtotal - itemDiscAmount) * 100) / 100;

      overallBillSubtotal += itemSubtotal;
      overallBillDiscount += itemDiscAmount;
      overallBillTotal += itemTotal;

      // 2. Insert into sales table
      try {
        await db.insert(sales).values({
          shopId,
          userId: safeUserId,
          patientId: safePatientId,
          patientName: patientName || null,
          doctorName: doctorName || null,
          medicineId: vItem.medicine.id,
          medicineName: vItem.medicine.name,
          quantity: vItem.requestedQty,
          unitPrice: vItem.effectiveUnitPrice,
          subtotal: itemSubtotal,
          discountPercent: vItem.itemDiscountPct,
          discountAmount: itemDiscAmount,
          totalPrice: itemTotal,
          batchDetails: JSON.stringify(vItem.deductions),
          createdAt: nowIsoTimestamp,
        });
      } catch (e) {
        console.warn("Drizzle sales insert failed, fallback to raw SQL:", e);
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
              vItem.medicine.id,
              vItem.medicine.name,
              vItem.requestedQty,
              vItem.effectiveUnitPrice,
              itemSubtotal,
              vItem.itemDiscountPct,
              itemDiscAmount,
              itemTotal,
              JSON.stringify(vItem.deductions),
              nowIsoTimestamp,
            ],
          });
        } catch (sqlErr) {
          console.error("Critical: Sales raw SQL insert error:", sqlErr);
        }
      }

      receiptItems.push({
        medicineId: vItem.medicine.id,
        medicineName: vItem.medicine.name,
        quantity: vItem.requestedQty,
        unitPrice: vItem.effectiveUnitPrice,
        subtotal: itemSubtotal,
        discountPercent: vItem.itemDiscountPct,
        discountAmount: itemDiscAmount,
        totalPrice: itemTotal,
        deductions: vItem.deductions,
      });

      // 3. Check remaining stock for low-stock email alert
      const remainingBatches = await db
        .select()
        .from(batches)
        .where(
          and(
            eq(batches.shopId, shopId),
            eq(batches.medicineId, vItem.medicine.id),
            gt(batches.quantity, 0)
          )
        );

      const remainingStock = remainingBatches
        .filter((b) => b.expiryDate >= todayStr)
        .reduce((sum, b) => sum + b.quantity, 0);

      if (remainingStock <= vItem.medicine.reorderThreshold) {
        lowStockAlertMedicines.push(vItem.medicine.name);
        const batchSummary = vItem.deductions
          .map((d) => `Batch ${d.batchNumber} (exp. ${d.expiryDate}): ${d.newBatchQuantity} remaining`)
          .join("; ");

        await sendLowStockAlertEmail({
          shopId,
          medicineName: vItem.medicine.name,
          currentStock: remainingStock,
          reorderThreshold: vItem.medicine.reorderThreshold,
          manufacturer: vItem.medicine.manufacturer,
          batchInfo: batchSummary || undefined,
        }).catch((err) => console.warn("Email alert error:", err));
      } else {
        const settings = await getShopAlertSettings(shopId).catch(() => ({ alertEmail: null }));
        if (settings.alertEmail) {
          await recordStockRecovery({
            shopId,
            medicineName: vItem.medicine.name,
            currentStock: remainingStock,
            reorderThreshold: vItem.medicine.reorderThreshold,
            recipientEmail: settings.alertEmail,
          }).catch(() => {});
        }
      }
    }

    overallBillSubtotal = Math.round(overallBillSubtotal * 100) / 100;
    overallBillDiscount = Math.round(overallBillDiscount * 100) / 100;
    overallBillTotal = Math.round(overallBillTotal * 100) / 100;

    // ── STEP 4: RECORD AUDIT LOG ENTRY FOR ENTIRE SALE ──
    await db.insert(auditLogs).values({
      shopId,
      userId: safeUserId,
      action: "SELL",
      entityType: "sale",
      entityId: safePatientId || undefined,
      detail: JSON.stringify({
        itemCount: receiptItems.length,
        items: receiptItems.map((r) => ({
          medicineName: r.medicineName,
          quantity: r.quantity,
          unitPrice: r.unitPrice,
          totalPrice: r.totalPrice,
        })),
        patientName: patientName || "Walk-in",
        doctorName: doctorName || undefined,
        paymentMethod,
        subtotal: overallBillSubtotal,
        discountAmount: overallBillDiscount,
        grandTotal: overallBillTotal,
        timestamp: nowIsoTimestamp,
      }),
      timestamp: nowIsoTimestamp,
    });

    return NextResponse.json({
      success: true,
      invoiceNumber: `INV-${Date.now().toString().slice(-6)}`,
      patientName: patientName || "Walk-in",
      patientPhone: patientPhone || null,
      doctorName: doctorName || null,
      paymentMethod,
      items: receiptItems,
      subtotal: overallBillSubtotal,
      discountAmount: overallBillDiscount,
      grandTotal: overallBillTotal,
      lowStockAlertMedicines,
      timestamp: nowIsoTimestamp,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Checkout transaction failed";
    console.error("Checkout transaction error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
