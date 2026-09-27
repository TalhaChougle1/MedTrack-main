import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { medicines, batches, auditLogs, shops } from "@/lib/db/schema";
import { eq, and, sql, like } from "drizzle-orm";
import { autoClassifySchedule } from "@/lib/scheduleClassifier";
import { syncAndRestoreDatabase, persistCurrentDatabaseState } from "@/lib/db/storeSync";

export async function GET() {
  const session = await getAuthSession();
  const shopId = session?.user?.shopId || 1;

  try {
    await syncAndRestoreDatabase();
    // Select medicines and calculate total stock & batch count per medicine
    const medList = await db
      .select({
        id: medicines.id,
        shopId: medicines.shopId,
        name: medicines.name,
        barcode: medicines.barcode,
        manufacturer: medicines.manufacturer,
        schedule: medicines.schedule,
        unitPrice: sql<number>`COALESCE(NULLIF(${medicines.unitPrice}, 0), MAX(${batches.costPrice}), 0)`,
        reorderThreshold: medicines.reorderThreshold,
        createdAt: medicines.createdAt,
        totalStock: sql<number>`COALESCE(SUM(${batches.quantity}), 0)`,
        batchCount: sql<number>`COUNT(${batches.id})`,
      })
      .from(medicines)
      .leftJoin(batches, eq(medicines.id, batches.medicineId))
      .where(eq(medicines.shopId, shopId))
      .groupBy(
        medicines.id,
        medicines.shopId,
        medicines.name,
        medicines.barcode,
        medicines.manufacturer,
        medicines.schedule,
        medicines.unitPrice,
        medicines.reorderThreshold,
        medicines.createdAt
      )
      .orderBy(medicines.name);

    const formatted = medList.map((m) => ({
      ...m,
      unitPrice: Number(m.unitPrice) || 0,
      totalStock: Number(m.totalStock) || 0,
      batchCount: Number(m.batchCount) || 0,
    }));

    return NextResponse.json(formatted);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to fetch medicines";
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
    const { name, manufacturer, barcode, schedule, unitPrice, reorderThreshold } = body;

    if (!name || !manufacturer) {
      return NextResponse.json(
        { error: "Medicine name and manufacturer are required." },
        { status: 400 }
      );
    }

    const trimmedBarcode = barcode?.trim() || null;

    // Check barcode uniqueness per shop if barcode is provided
    if (trimmedBarcode) {
      const existing = await db
        .select()
        .from(medicines)
        .where(
          and(
            eq(medicines.shopId, shopId),
            eq(medicines.barcode, trimmedBarcode)
          )
        );

      if (existing.length > 0) {
        return NextResponse.json(
          { error: `Barcode '${trimmedBarcode}' is already assigned to another medicine in your shop.` },
          { status: 400 }
        );
      }
    }

    // Ensure shop record exists for foreign key constraint safety
    const [existingShop] = await db.select().from(shops).where(eq(shops.id, shopId));
    if (!existingShop) {
      await db.insert(shops).values({
        id: shopId,
        name: "Apex MedTrack Pharmacy",
        address: "123 Health Ave",
        phone: "+1-800-555-MEDS",
      });
    }

    const autoSchedule = (schedule && schedule !== "OTC") ? schedule : autoClassifySchedule(name.trim());

    const [newMed] = await db
      .insert(medicines)
      .values({
        shopId,
        name: name.trim(),
        manufacturer: manufacturer.trim(),
        barcode: trimmedBarcode,
        schedule: autoSchedule,
        unitPrice: parseFloat(unitPrice) || 0,
        reorderThreshold: parseInt(reorderThreshold) || 10,
      })
      .returning();

    // Audit log
    await db.insert(auditLogs).values({
      shopId,
      userId,
      action: "MEDICINE_ADD",
      entityType: "medicine",
      entityId: newMed.id,
      detail: JSON.stringify({
        name: newMed.name,
        barcode: newMed.barcode,
        manufacturer: newMed.manufacturer,
        schedule: newMed.schedule,
      }),
    });

    return NextResponse.json(newMed, { status: 201 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to add medicine";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
