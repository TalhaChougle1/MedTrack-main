import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { db, client } from "@/lib/db";
import { initDatabase } from "@/lib/db/init";
import { patients, sales } from "@/lib/db/schema";
import { eq, and, like, desc, sql } from "drizzle-orm";

export async function GET(req: Request) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const shopId = Number(session.user?.shopId) || 1;
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") || "";

  try {
    // 0. Ensure database tables & schema alterations exist
    try {
      await initDatabase();
    } catch (e) {
      console.warn("DB init warning in patients GET:", e);
    }

    // 1. Fetch patients currently registered in `patients` table
    const patientList = await db
      .select()
      .from(patients)
      .where(
        q
          ? and(sql`(${patients.shopId} = ${shopId} OR ${patients.shopId} IS NULL)`, like(patients.name, `%${q}%`))
          : sql`(${patients.shopId} = ${shopId} OR ${patients.shopId} IS NULL)`
      )
      .orderBy(desc(patients.createdAt));

    // 2. Fetch distinct non-null patient names from `sales` table to discover any sales logged with a patient name
    const distinctSalesPatients = await db
      .select({
        patientName: sales.patientName,
      })
      .from(sales)
      .where(
        and(
          sql`(${sales.shopId} = ${shopId} OR ${sales.shopId} IS NULL)`,
          sql`${sales.patientName} IS NOT NULL AND ${sales.patientName} != ''`
        )
      )
      .groupBy(sales.patientName);

    // 3. Auto-register any missing patient names from sales into patients table
    const existingNamesLower = new Set(patientList.map((p) => p.name.toLowerCase()));

    for (const sp of distinctSalesPatients) {
      if (sp.patientName && !existingNamesLower.has(sp.patientName.toLowerCase())) {
        if (!q || sp.patientName.toLowerCase().includes(q.toLowerCase())) {
          try {
            await client.execute({
              sql: "INSERT INTO patients (shop_id, name) VALUES (?, ?)",
              args: [shopId, sp.patientName],
            });
            existingNamesLower.add(sp.patientName.toLowerCase());
          } catch (e) {
            console.warn("Auto-register patient from sales warning:", e);
          }
        }
      }
    }

    // 4. Re-fetch consolidated patient registry
    const consolidatedPatients = await db
      .select()
      .from(patients)
      .where(
        q
          ? and(sql`(${patients.shopId} = ${shopId} OR ${patients.shopId} IS NULL)`, like(patients.name, `%${q}%`))
          : sql`(${patients.shopId} = ${shopId} OR ${patients.shopId} IS NULL)`
      )
      .orderBy(desc(patients.createdAt));

    // 5. Enrich patients with purchase metrics (total orders, total amount spent, last purchase date)
    const enrichedPatients = await Promise.all(
      consolidatedPatients.map(async (p) => {
        const patientSales = await db
          .select({
            id: sales.id,
            totalPrice: sales.totalPrice,
            createdAt: sales.createdAt,
          })
          .from(sales)
          .where(
            and(
              sql`(${sales.shopId} = ${shopId} OR ${sales.shopId} IS NULL)`,
              sql`(${sales.patientId} = ${p.id} OR LOWER(${sales.patientName}) = LOWER(${p.name}))`
            )
          )
          .orderBy(desc(sales.createdAt));

        const totalOrders = patientSales.length;
        const totalSpent = patientSales.reduce((sum, s) => sum + (s.totalPrice || 0), 0);
        const lastVisit = patientSales.length > 0 ? patientSales[0].createdAt : p.createdAt;

        return {
          ...p,
          totalOrders,
          totalSpent: Math.round(totalSpent * 100) / 100,
          lastVisit,
        };
      })
    );

    return NextResponse.json(enrichedPatients);
  } catch (error: unknown) {
    console.error("Fetch patients error:", error);
    const msg = error instanceof Error ? error.message : "Failed to fetch patients";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
