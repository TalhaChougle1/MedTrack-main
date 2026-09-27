import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { sales, medicines, batches } from "@/lib/db/schema";
import { eq, and, gte, lte, sql, desc } from "drizzle-orm";

export async function GET(req: Request) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const shopId = session.user.shopId || 1;
  const { searchParams } = new URL(req.url);
  const period = searchParams.get("period") || "today"; // today | week | month | all | custom
  const customStart = searchParams.get("startDate");
  const customEnd = searchParams.get("endDate");

  try {
    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];

    // Compute date ranges
    const startOfTodayIso = `${todayStr}T00:00:00.000Z`;
    const endOfTodayIso = `${todayStr}T23:59:59.999Z`;

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay())).toISOString();

    // 1. TODAY'S SALES
    const todaySales = await db
      .select({
        totalRevenue: sql<number>`COALESCE(SUM(${sales.totalPrice}), 0)`,
        totalUnits: sql<number>`COALESCE(SUM(${sales.quantity}), 0)`,
        transactionCount: sql<number>`COUNT(${sales.id})`,
      })
      .from(sales)
      .where(
        and(
          eq(sales.shopId, shopId),
          gte(sales.createdAt, startOfTodayIso)
        )
      );

    const todayStats = {
      revenue: Number(todaySales[0]?.totalRevenue) || 0,
      unitsSold: Number(todaySales[0]?.totalUnits) || 0,
      transactions: Number(todaySales[0]?.transactionCount) || 0,
    };

    // 2. THIS MONTH'S SALES
    const monthSales = await db
      .select({
        totalRevenue: sql<number>`COALESCE(SUM(${sales.totalPrice}), 0)`,
        totalUnits: sql<number>`COALESCE(SUM(${sales.quantity}), 0)`,
        transactionCount: sql<number>`COUNT(${sales.id})`,
      })
      .from(sales)
      .where(
        and(
          eq(sales.shopId, shopId),
          gte(sales.createdAt, startOfMonth)
        )
      );

    const monthStats = {
      revenue: Number(monthSales[0]?.totalRevenue) || 0,
      unitsSold: Number(monthSales[0]?.totalUnits) || 0,
      transactions: Number(monthSales[0]?.transactionCount) || 0,
    };

    // 3. PERIOD-FILTERED QUERY FOR TOP SELLING MEDICINES
    const periodConditions = [eq(sales.shopId, shopId)];
    if (period === "today") {
      periodConditions.push(gte(sales.createdAt, startOfTodayIso));
    } else if (period === "week") {
      periodConditions.push(gte(sales.createdAt, startOfWeek));
    } else if (period === "month") {
      periodConditions.push(gte(sales.createdAt, startOfMonth));
    } else if (period === "custom" && customStart) {
      periodConditions.push(gte(sales.createdAt, customStart));
      if (customEnd) {
        periodConditions.push(lte(sales.createdAt, `${customEnd}T23:59:59.999Z`));
      }
    }

    const topSelling = await db
      .select({
        medicineId: sales.medicineId,
        medicineName: sales.medicineName,
        totalQuantitySold: sql<number>`SUM(${sales.quantity})`,
        totalRevenue: sql<number>`ROUND(SUM(${sales.totalPrice}), 2)`,
        salesCount: sql<number>`COUNT(${sales.id})`,
      })
      .from(sales)
      .where(and(...periodConditions))
      .groupBy(sales.medicineId, sales.medicineName)
      .orderBy(desc(sql`SUM(${sales.quantity})`))
      .limit(10);

    const topSellingFormatted = topSelling.map((t, idx) => ({
      rank: idx + 1,
      medicineId: t.medicineId,
      medicineName: t.medicineName,
      totalQuantitySold: Number(t.totalQuantitySold) || 0,
      totalRevenue: Number(t.totalRevenue) || 0,
      salesCount: Number(t.salesCount) || 0,
    }));

    // 4. RECENT TRANSACTIONS (5 most recent sales)
    const recentSales = await db
      .select({
        id: sales.id,
        medicineName: sales.medicineName,
        quantity: sales.quantity,
        totalPrice: sales.totalPrice,
        patientName: sales.patientName,
        createdAt: sales.createdAt,
      })
      .from(sales)
      .where(eq(sales.shopId, shopId))
      .orderBy(desc(sales.createdAt))
      .limit(5);

    return NextResponse.json({
      today: todayStats,
      month: monthStats,
      topSelling: topSellingFormatted,
      recentSales,
      period,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to compute sales statistics";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
