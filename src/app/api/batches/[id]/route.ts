import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { batches, medicines, auditLogs, wastageLogs } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { persistCurrentDatabaseState } from "@/lib/db/storeSync";

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
  const resolvedParams = await params;
  const batchId = parseInt(resolvedParams.id);

  if (isNaN(batchId)) {
    return NextResponse.json({ error: "Invalid batch ID" }, { status: 400 });
  }

  try {
    // 1. Verify batch exists and belongs to this shop
    const [batch] = await db
      .select({
        id: batches.id,
        batchNumber: batches.batchNumber,
        quantity: batches.quantity,
        medicineId: batches.medicineId,
        medicineName: medicines.name,
      })
      .from(batches)
      .innerJoin(medicines, eq(batches.medicineId, medicines.id))
      .where(and(eq(batches.id, batchId), eq(batches.shopId, shopId)));

    if (!batch) {
      return NextResponse.json({ error: "Batch not found in your inventory" }, { status: 404 });
    }

    // 2. Unlink wastage logs referencing this batch
    await db
      .update(wastageLogs)
      .set({ batchId: null })
      .where(and(eq(wastageLogs.shopId, shopId), eq(wastageLogs.batchId, batchId)))
      .catch(() => {});

    // 3. Delete batch record
    await db.delete(batches).where(and(eq(batches.id, batchId), eq(batches.shopId, shopId)));

    // 4. Immediately sync memory cache & snapshot
    await persistCurrentDatabaseState();

    // 5. Audit Log
    await db.insert(auditLogs).values({
      shopId,
      userId,
      action: "BATCH_DELETE",
      entityType: "batch",
      entityId: batchId,
      detail: JSON.stringify({
        medicineName: batch.medicineName,
        batchNumber: batch.batchNumber,
        deletedQuantity: batch.quantity,
      }),
    });

    return NextResponse.json({
      success: true,
      message: `Successfully deleted Batch '${batch.batchNumber}' for ${batch.medicineName}.`,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to delete batch";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
