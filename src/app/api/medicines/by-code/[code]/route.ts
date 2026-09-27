import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { medicines, batches } from "@/lib/db/schema";
import { eq, and, sql, asc } from "drizzle-orm";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const shopId = session.user.shopId;
  const { code } = await params;
  const decodedCode = decodeURIComponent(code).trim();

  try {
    let medList = await db
      .select()
      .from(medicines)
      .where(
        and(
          eq(medicines.shopId, shopId),
          eq(medicines.barcode, decodedCode)
        )
      );

    if (medList.length === 0) {
      const searchPattern = `%${decodedCode}%`;
      medList = await db
        .select()
        .from(medicines)
        .where(
          and(
            eq(medicines.shopId, shopId),
            sql`(${medicines.barcode} LIKE ${searchPattern} OR ${medicines.name} LIKE ${searchPattern})`
          )
        );
    }

    const med = medList[0];

    if (!med) {
      return NextResponse.json(
        { error: "No medicine registered with this barcode. Register it first." },
        { status: 404 }
      );
    }

    // Fetch batches for this medicine ordered by expiry date ASC
    const medBatches = await db
      .select()
      .from(batches)
      .where(
        and(
          eq(batches.shopId, shopId),
          eq(batches.medicineId, med.id)
        )
      )
      .orderBy(asc(batches.expiryDate));

    const totalStock = medBatches.reduce((acc, b) => acc + b.quantity, 0);

    return NextResponse.json({
      medicine: med,
      batches: medBatches,
      totalStock,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Lookup failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
