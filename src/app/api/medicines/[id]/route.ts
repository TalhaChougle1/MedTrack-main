import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { medicines, batches, auditLogs, incomingOrders, wastageLogs, sales } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { persistCurrentDatabaseState } from "@/lib/db/storeSync";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const shopId = session.user.shopId;
  const userId = parseInt(session.user.id);
  const userRole = session.user.role;
  const resolvedParams = await params;
  const medId = parseInt(resolvedParams.id);

  if (isNaN(medId)) {
    return NextResponse.json({ error: "Invalid medicine ID." }, { status: 400 });
  }

  try {
    const body = await req.json();

    // Verify medicine belongs to this shop
    const [med] = await db
      .select()
      .from(medicines)
      .where(and(eq(medicines.id, medId), eq(medicines.shopId, shopId)));

    if (!med) {
      return NextResponse.json(
        { error: "Medicine not found in your inventory." },
        { status: 404 }
      );
    }

    // Handle Archive Action
    if (body.action === "archive") {
      if (userRole !== "owner" && userRole !== "admin") {
        return NextResponse.json(
          { error: "Forbidden. Only administrators can archive medicines." },
          { status: 403 }
        );
      }

      const now = new Date().toISOString();
      const [updated] = await db
        .update(medicines)
        .set({ isArchived: true, archivedAt: now })
        .where(and(eq(medicines.id, medId), eq(medicines.shopId, shopId)))
        .returning();

      await persistCurrentDatabaseState();

      await db.insert(auditLogs).values({
        shopId,
        userId,
        action: "MEDICINE_ARCHIVE",
        entityType: "medicine",
        entityId: medId,
        detail: JSON.stringify({
          name: med.name,
          manufacturer: med.manufacturer,
          archivedBy: session.user.name || "Administrator",
          userRole,
        }),
      });

      return NextResponse.json({
        success: true,
        message: `Medicine '${med.name}' has been archived and removed from active stock workflows.`,
        medicine: updated,
      });
    }

    // Handle Restore Action
    if (body.action === "restore") {
      if (userRole !== "owner" && userRole !== "admin") {
        return NextResponse.json(
          { error: "Forbidden. Only administrators can restore archived medicines." },
          { status: 403 }
        );
      }

      const [updated] = await db
        .update(medicines)
        .set({ isArchived: false, archivedAt: null })
        .where(and(eq(medicines.id, medId), eq(medicines.shopId, shopId)))
        .returning();

      await persistCurrentDatabaseState();

      await db.insert(auditLogs).values({
        shopId,
        userId,
        action: "MEDICINE_RESTORE",
        entityType: "medicine",
        entityId: medId,
        detail: JSON.stringify({
          name: med.name,
          manufacturer: med.manufacturer,
          restoredBy: session.user.name || "Administrator",
          userRole,
        }),
      });

      return NextResponse.json({
        success: true,
        message: `Medicine '${med.name}' has been restored to active inventory.`,
        medicine: updated,
      });
    }

    // Handle Reorder Threshold Update
    const { reorderThreshold } = body;
    if (reorderThreshold !== undefined) {
      const threshold = parseInt(reorderThreshold);
      if (isNaN(threshold) || threshold < 0) {
        return NextResponse.json(
          { error: "Alert threshold must be a whole number of 0 or greater." },
          { status: 400 }
        );
      }

      const [updated] = await db
        .update(medicines)
        .set({ reorderThreshold: threshold })
        .where(and(eq(medicines.id, medId), eq(medicines.shopId, shopId)))
        .returning();

      await persistCurrentDatabaseState();

      await db.insert(auditLogs).values({
        shopId,
        userId,
        action: "MEDICINE_UPDATE",
        entityType: "medicine",
        entityId: medId,
        detail: JSON.stringify({
          name: med.name,
          previousThreshold: med.reorderThreshold,
          newThreshold: threshold,
        }),
      });

      return NextResponse.json({
        success: true,
        message: `Low stock alert threshold updated to ${threshold} units for ${med.name}.`,
        medicine: updated,
      });
    }

    return NextResponse.json({ error: "No recognized action or field provided." }, { status: 400 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to update medicine.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const shopId = session.user.shopId;
  const userId = parseInt(session.user.id);
  const userRole = session.user.role;
  const resolvedParams = await params;
  const medId = parseInt(resolvedParams.id);

  if (isNaN(medId)) {
    return NextResponse.json({ error: "Invalid medicine ID" }, { status: 400 });
  }

  // 1. Role-based Permission Check
  if (userRole !== "owner" && userRole !== "admin") {
    return NextResponse.json(
      { error: "Forbidden. Only authorized administrators can permanently delete medicines." },
      { status: 403 }
    );
  }

  try {
    // 2. Verify medicine exists and belongs to this shop
    const [med] = await db
      .select()
      .from(medicines)
      .where(and(eq(medicines.id, medId), eq(medicines.shopId, shopId)));

    if (!med) {
      return NextResponse.json({ error: "Medicine not found in your inventory" }, { status: 404 });
    }

    // 3. Safety check: Check for historical transactions (sales)
    const [salesRecord] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(sales)
      .where(and(eq(sales.shopId, shopId), eq(sales.medicineId, medId)));
    const salesCount = Number(salesRecord?.count || 0);

    if (salesCount > 0) {
      return NextResponse.json(
        {
          error: `Cannot permanently delete '${med.name}' because it has ${salesCount} historical sales record(s). To preserve audit and financial records, please Archive this medicine instead.`,
          canArchive: true,
          salesCount,
        },
        { status: 409 }
      );
    }

    // 4. Inspect existing batches for audit detail
    const existingBatches = await db
      .select()
      .from(batches)
      .where(and(eq(batches.shopId, shopId), eq(batches.medicineId, medId)));
    const totalUnits = existingBatches.reduce((acc, b) => acc + (Number(b.quantity) || 0), 0);

    // 5. Delete associated child records explicitly to avoid orphaned rows
    await db.delete(wastageLogs).where(and(eq(wastageLogs.shopId, shopId), eq(wastageLogs.medicineId, medId))).catch(() => {});
    await db.delete(incomingOrders).where(and(eq(incomingOrders.shopId, shopId), eq(incomingOrders.medicineId, medId))).catch(() => {});
    await db.delete(batches).where(and(eq(batches.shopId, shopId), eq(batches.medicineId, medId))).catch(() => {});

    // 6. Delete primary medicine record
    await db.delete(medicines).where(and(eq(medicines.id, medId), eq(medicines.shopId, shopId)));

    // 7. Sync memory cache & disk snapshot
    await persistCurrentDatabaseState();

    // 8. Log audit trail
    await db.insert(auditLogs).values({
      shopId,
      userId,
      action: "MEDICINE_DELETE",
      entityType: "medicine",
      entityId: medId,
      detail: JSON.stringify({
        name: med.name,
        barcode: med.barcode,
        manufacturer: med.manufacturer,
        batchesDeleted: existingBatches.length,
        totalStockDeleted: totalUnits,
        deletedBy: session.user.name || "Administrator",
        userRole,
      }),
    });

    return NextResponse.json({
      success: true,
      message: `Successfully deleted medicine '${med.name}' and all ${existingBatches.length} associated stock batches.`,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to delete medicine";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
