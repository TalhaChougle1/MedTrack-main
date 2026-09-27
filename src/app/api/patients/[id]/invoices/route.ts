import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { patients, sales, shops } from "@/lib/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const shopId = Number(session.user?.shopId) || 1;
  const { id } = await params;
  const patientId = parseInt(id);

  if (isNaN(patientId)) {
    return NextResponse.json({ error: "Invalid patient ID" }, { status: 400 });
  }

  try {
    // 1. Verify patient belongs to shop
    const [patient] = await db
      .select()
      .from(patients)
      .where(and(eq(patients.id, patientId), eq(patients.shopId, shopId)));

    if (!patient) {
      return NextResponse.json({ error: "Patient record not found" }, { status: 404 });
    }

    // 2. Fetch shop details for invoice header
    const [shop] = await db.select().from(shops).where(eq(shops.id, shopId));

    // 3. Fetch sales records for patient
    const patientInvoices = await db
      .select()
      .from(sales)
      .where(
        and(
          eq(sales.shopId, shopId),
          sql`(${sales.patientId} = ${patientId} OR LOWER(${sales.patientName}) = LOWER(${patient.name}))`
        )
      )
      .orderBy(desc(sales.createdAt));

    return NextResponse.json({
      patient,
      shop: shop || { name: "MedTrack Pharmacy", address: "", phone: "", licenseNumber: "" },
      invoices: patientInvoices.map((inv) => ({
        ...inv,
        parsedBatchDetails: inv.batchDetails ? JSON.parse(inv.batchDetails) : [],
      })),
    });
  } catch (error: unknown) {
    console.error("Fetch patient invoices error:", error);
    const msg = error instanceof Error ? error.message : "Failed to fetch patient invoices";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
