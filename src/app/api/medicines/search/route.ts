import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { medicines, batches } from "@/lib/db/schema";
import { eq, and, or, like, sql } from "drizzle-orm";

export async function GET(req: Request) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() || "";

  if (!q) {
    return NextResponse.json([]);
  }

  const shopId = session.user.shopId;
  const pattern = `%${q}%`;

  try {
    const results = await db
      .select({
        id: medicines.id,
        shopId: medicines.shopId,
        name: medicines.name,
        barcode: medicines.barcode,
        manufacturer: medicines.manufacturer,
        schedule: medicines.schedule,
        unitPrice: sql<number>`COALESCE(NULLIF(${medicines.unitPrice}, 0), MAX(${batches.costPrice}), 0)`,
        reorderThreshold: medicines.reorderThreshold,
        totalStock: sql<number>`COALESCE(SUM(${batches.quantity}), 0)`,
      })
      .from(medicines)
      .leftJoin(batches, eq(medicines.id, batches.medicineId))
      .where(
        and(
          eq(medicines.shopId, shopId),
          or(
            like(medicines.name, pattern),
            like(medicines.barcode, pattern),
            like(medicines.manufacturer, pattern)
          )
        )
      )
      .groupBy(medicines.id)
      .limit(20);

    return NextResponse.json(results);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Search failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
