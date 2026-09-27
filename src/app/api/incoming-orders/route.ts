import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { incomingOrders, medicines, auditLogs } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { sendIncomingOrderAlertEmail } from "@/lib/emailService";

export async function GET() {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const shopId = session.user.shopId;

  try {
    const list = await db
      .select({
        id: incomingOrders.id,
        shopId: incomingOrders.shopId,
        medicineId: incomingOrders.medicineId,
        medicineName: medicines.name,
        manufacturer: medicines.manufacturer,
        schedule: medicines.schedule,
        expectedQuantity: incomingOrders.expectedQuantity,
        expectedArrivalDate: incomingOrders.expectedArrivalDate,
        supplier: incomingOrders.supplier,
        status: incomingOrders.status,
        createdAt: incomingOrders.createdAt,
      })
      .from(incomingOrders)
      .innerJoin(medicines, eq(incomingOrders.medicineId, medicines.id))
      .where(eq(incomingOrders.shopId, shopId))
      .orderBy(desc(incomingOrders.createdAt));

    return NextResponse.json(list);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to fetch orders";
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
    const { medicineId, expectedQuantity, expectedArrivalDate, supplier } = body;

    const medId = parseInt(medicineId);
    const qty = parseInt(expectedQuantity);

    if (isNaN(medId) || isNaN(qty) || qty <= 0 || !expectedArrivalDate || !supplier) {
      return NextResponse.json(
        { error: "Medicine, expected quantity, expected arrival date, and supplier are required." },
        { status: 400 }
      );
    }

    // Check medicine belongs to shop
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

    const [newOrder] = await db
      .insert(incomingOrders)
      .values({
        shopId,
        medicineId: med.id,
        expectedQuantity: qty,
        expectedArrivalDate: expectedArrivalDate.trim(),
        supplier: supplier.trim(),
        status: "pending",
      })
      .returning();

    // Audit log
    await db.insert(auditLogs).values({
      shopId,
      userId,
      action: "ORDER_CREATE",
      entityType: "order",
      entityId: newOrder.id,
      detail: JSON.stringify({
        medicineName: med.name,
        expectedQuantity: qty,
        expectedArrivalDate: newOrder.expectedArrivalDate,
        supplier: newOrder.supplier,
      }),
    });

    // Trigger email alert notification to medical staff for incoming stock order.
    // Awaited so Vercel does not kill the function before Brevo responds.
    await sendIncomingOrderAlertEmail({
      shopId,
      medicineName: med.name,
      expectedQuantity: qty,
      expectedArrivalDate: newOrder.expectedArrivalDate,
      supplier: newOrder.supplier,
      status: newOrder.status,
    });

    return NextResponse.json(newOrder, { status: 201 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to create order";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const shopId = session.user.shopId;
  const userId = parseInt(session.user.id);

  try {
    const body = await req.json();
    const { id, status } = body;

    const orderId = parseInt(id);
    if (isNaN(orderId) || !["pending", "arrived", "delayed"].includes(status)) {
      return NextResponse.json(
        { error: "Valid order ID and status ('pending', 'arrived', 'delayed') are required." },
        { status: 400 }
      );
    }

    const [existingOrder] = await db
      .select()
      .from(incomingOrders)
      .where(
        and(
          eq(incomingOrders.id, orderId),
          eq(incomingOrders.shopId, shopId)
        )
      );

    if (!existingOrder) {
      return NextResponse.json({ error: "Order not found." }, { status: 404 });
    }

    const [updatedOrder] = await db
      .update(incomingOrders)
      .set({ status })
      .where(eq(incomingOrders.id, orderId))
      .returning();

    await db.insert(auditLogs).values({
      shopId,
      userId,
      action: "STATUS_UPDATE",
      entityType: "order",
      entityId: updatedOrder.id,
      detail: JSON.stringify({
        previousStatus: existingOrder.status,
        newStatus: status,
      }),
    });

    return NextResponse.json(updatedOrder);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to update order status";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
