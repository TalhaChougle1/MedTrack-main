import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { wastageLogs, batches, medicines, users, auditLogs } from "@/lib/db/schema";
import { eq, and, desc, gt, gte, lte, like } from "drizzle-orm";
import {
  sendLowStockAlertEmail,
  getShopAlertSettings,
} from "@/lib/emailService";

// ─── GET — wastage log (supports optional filter query params) ───────────────
export async function GET(req: Request) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const shopId = session.user.shopId;
  const { searchParams } = new URL(req.url);

  const startDate = searchParams.get("startDate"); // YYYY-MM-DD
  const endDate   = searchParams.get("endDate");   // YYYY-MM-DD
  const medicine  = searchParams.get("medicine");  // partial name match
  const reason    = searchParams.get("reason");    // exact match

  try {
    const conditions = [eq(wastageLogs.shopId, shopId)];

    if (startDate) conditions.push(gte(wastageLogs.date, startDate));
    if (endDate)   conditions.push(lte(wastageLogs.date, endDate + "T23:59:59.999Z"));
    if (reason)    conditions.push(eq(wastageLogs.reason, reason));

    const list = await db
      .select({
        id:              wastageLogs.id,
        shopId:          wastageLogs.shopId,
        medicineId:      wastageLogs.medicineId,
        medicineName:    medicines.name,
        batchId:         wastageLogs.batchId,
        batchNumber:     wastageLogs.batchNumber,
        quantity:        wastageLogs.quantity,
        reason:          wastageLogs.reason,
        performedBy:     wastageLogs.performedBy,
        performedByName: users.name,
        date:            wastageLogs.date,
      })
      .from(wastageLogs)
      .innerJoin(medicines, eq(wastageLogs.medicineId, medicines.id))
      .leftJoin(users, eq(wastageLogs.performedBy, users.id))
      .where(and(...conditions))
      .orderBy(desc(wastageLogs.date));

    // Post-filter by medicine name (can't easily join-filter with Drizzle's current API)
    const filtered = medicine
      ? list.filter((r) => r.medicineName?.toLowerCase().includes(medicine.toLowerCase()))
      : list;

    return NextResponse.json(filtered);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to fetch wastage logs";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─── POST — record a wastage write-off ──────────────────────────────────────
export async function POST(req: Request) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const shopId = session.user.shopId;
  const userId = parseInt(session.user.id);

  try {
    const body = await req.json();
    const { batchId, quantity, reason } = body;

    const bId = parseInt(batchId);
    const qty = parseInt(quantity);

    if (isNaN(bId) || isNaN(qty) || qty <= 0 || !reason) {
      return NextResponse.json(
        { error: "Valid batchId, positive quantity, and reason are required." },
        { status: 400 }
      );
    }

    // Verify batch belongs to shop
    const [batchItem] = await db
      .select()
      .from(batches)
      .where(and(eq(batches.id, bId), eq(batches.shopId, shopId)));

    if (!batchItem) {
      return NextResponse.json({ error: "Batch not found in your shop." }, { status: 404 });
    }

    if (qty > batchItem.quantity) {
      return NextResponse.json(
        { error: `Cannot write off ${qty} units. Batch only has ${batchItem.quantity} units.` },
        { status: 400 }
      );
    }

    // 1. Deduct from batch
    const newQty = batchItem.quantity - qty;
    await db.update(batches).set({ quantity: newQty }).where(eq(batches.id, batchItem.id));

    // 2. Insert wastage log
    const [wastageEntry] = await db
      .insert(wastageLogs)
      .values({
        shopId,
        medicineId:  batchItem.medicineId,
        batchId:     batchItem.id,
        batchNumber: batchItem.batchNumber,
        quantity:    qty,
        reason:      reason.trim(),
        performedBy: userId,
      })
      .returning();

    // 3. Audit log
    const [med] = await db
      .select()
      .from(medicines)
      .where(eq(medicines.id, batchItem.medicineId));

    await db.insert(auditLogs).values({
      shopId,
      userId,
      action:     "WASTAGE",
      entityType: "batch",
      entityId:   batchItem.id,
      detail: JSON.stringify({
        medicineName:      med?.name || "Unknown",
        batchNumber:       batchItem.batchNumber,
        quantityWrittenOff: qty,
        reason:            wastageEntry.reason,
        remainingInBatch:  newQty,
      }),
    });

    // 4. Low-stock email check after deduction
    if (med && med.reorderThreshold > 0) {
      const todayStr = new Date().toISOString().split("T")[0];

      const allBatches = await db
        .select()
        .from(batches)
        .where(and(eq(batches.shopId, shopId), eq(batches.medicineId, med.id), gt(batches.quantity, 0)));

      const remainingStock = allBatches
        .filter((b) => b.expiryDate >= todayStr)
        .reduce((sum, b) => sum + b.quantity, 0);

      if (remainingStock <= med.reorderThreshold) {
        await sendLowStockAlertEmail({
          shopId,
          medicineName:     med.name,
          currentStock:     remainingStock,
          reorderThreshold: med.reorderThreshold,
          manufacturer:     med.manufacturer,
        });
      }
    }

    return NextResponse.json(wastageEntry, { status: 201 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Wastage log creation failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
