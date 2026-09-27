import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { sales, users } from "@/lib/db/schema";
import { eq, desc, and, gte, lte, like } from "drizzle-orm";

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

  try {
    // Build WHERE conditions
    const conditions = [eq(sales.shopId, shopId)];

    // Date range: createdAt is stored as ISO string, so prefix-match YYYY-MM-DD
    if (startDate) conditions.push(gte(sales.createdAt, startDate));
    if (endDate)   conditions.push(lte(sales.createdAt, endDate + "T23:59:59.999Z"));
    if (medicine)  conditions.push(like(sales.medicineName, `%${medicine}%`));

    const list = await db
      .select({
        id:             sales.id,
        medicineName:   sales.medicineName,
        quantity:       sales.quantity,
        unitPrice:      sales.unitPrice,
        subtotal:       sales.subtotal,
        discountPercent: sales.discountPercent,
        discountAmount: sales.discountAmount,
        totalPrice:     sales.totalPrice,
        patientName:    sales.patientName,
        doctorName:     sales.doctorName,
        batchDetails:   sales.batchDetails,
        createdAt:      sales.createdAt,
        staffName:      users.name,
      })
      .from(sales)
      .leftJoin(users, eq(sales.userId, users.id))
      .where(and(...conditions))
      .orderBy(desc(sales.createdAt))
      .limit(1000);

    return NextResponse.json(list);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to fetch sales log";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
