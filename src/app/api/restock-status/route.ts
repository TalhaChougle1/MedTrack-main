import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { medicines, batches, incomingOrders } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";

export async function GET() {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const shopId = session.user.shopId;

  try {
    const todayStr = new Date().toISOString().split("T")[0];

    // 1. Fetch all medicines for this specific shop with their unexpired stock
    const medList = await db
      .select({
        id: medicines.id,
        name: medicines.name,
        manufacturer: medicines.manufacturer,
        barcode: medicines.barcode,
        schedule: medicines.schedule,
        unitPrice: medicines.unitPrice,
        reorderThreshold: medicines.reorderThreshold,
        totalStock: sql<number>`COALESCE(SUM(CASE WHEN ${batches.expiryDate} >= ${todayStr} THEN ${batches.quantity} ELSE 0 END), 0)`,
      })
      .from(medicines)
      .leftJoin(batches, eq(medicines.id, batches.medicineId))
      .where(eq(medicines.shopId, shopId))
      .groupBy(
        medicines.id,
        medicines.name,
        medicines.manufacturer,
        medicines.barcode,
        medicines.schedule,
        medicines.unitPrice,
        medicines.reorderThreshold
      );

    // 2. Filter medicines where available unexpired totalStock <= reorderThreshold
    const lowStockMeds = medList.filter((m) => Number(m.totalStock) <= m.reorderThreshold);

    // 3. Fetch all pending orders for shop
    const pendingOrdersList = await db
      .select()
      .from(incomingOrders)
      .where(
        and(
          eq(incomingOrders.shopId, shopId),
          eq(incomingOrders.status, "pending")
        )
      );

    // 4. Map each low-stock medicine with its pending orders & status
    const restockItems = lowStockMeds.map((med) => {
      const orders = pendingOrdersList.filter((o) => o.medicineId === med.id);
      const hasPendingOrder = orders.length > 0;

      return {
        ...med,
        status: hasPendingOrder ? "order_pending" : "needs_reorder",
        pendingOrders: orders.map((o) => ({
          id: o.id,
          expectedQuantity: o.expectedQuantity,
          expectedArrivalDate: o.expectedArrivalDate,
          supplier: o.supplier,
        })),
      };
    });

    return NextResponse.json(restockItems);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Restock status check failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
