import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { medicines, auditLogs } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { persistCurrentDatabaseState } from "@/lib/db/storeSync";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const shopId = session.user.shopId;
  const userId = parseInt(session.user.id);
  const userRole = session.user.role;
  const resolvedParams = await params;
  const medId = parseInt(resolvedParams.id);

  if (isNaN(medId)) {
    return NextResponse.json({ error: "Invalid medicine ID" }, { status: 400 });
  }

  // Permission Check
  if (userRole !== "owner" && userRole !== "admin") {
    return NextResponse.json(
      { error: "Forbidden. Only administrators can archive medicines." },
      { status: 403 }
    );
  }

  try {
    const [med] = await db
      .select()
      .from(medicines)
      .where(and(eq(medicines.id, medId), eq(medicines.shopId, shopId)));

    if (!med) {
      return NextResponse.json({ error: "Medicine not found" }, { status: 404 });
    }

    const now = new Date().toISOString();
    const [updated] = await db
      .update(medicines)
      .set({ isArchived: true, archivedAt: now })
      .where(and(eq(medicines.id, medId), eq(medicines.shopId, shopId)))
      .returning();

    await persistCurrentDatabaseState();

    await db.insert(auditLogs).values({
      shopId,
      userId,
      action: "MEDICINE_ARCHIVE",
      entityType: "medicine",
      entityId: medId,
      detail: JSON.stringify({
        name: med.name,
        manufacturer: med.manufacturer,
        archivedBy: session.user.name || "Administrator",
        userRole,
      }),
    });

    return NextResponse.json({
      success: true,
      message: `Medicine '${med.name}' archived successfully and hidden from active inventory.`,
      medicine: updated,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to archive medicine";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
