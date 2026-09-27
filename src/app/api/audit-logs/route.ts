import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { auditLogs, users } from "@/lib/db/schema";
import { eq, and, desc, gte, lte } from "drizzle-orm";

export async function GET(req: Request) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const shopId = session.user.shopId || 1;
  const { searchParams } = new URL(req.url);

  const actionFilter = searchParams.get("action");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const limit = Math.min(500, parseInt(searchParams.get("limit") || "100"));

  try {
    const conditions = [eq(auditLogs.shopId, shopId)];

    if (actionFilter && actionFilter !== "ALL") {
      conditions.push(eq(auditLogs.action, actionFilter));
    }
    if (startDate) {
      conditions.push(gte(auditLogs.timestamp, `${startDate}T00:00:00.000Z`));
    }
    if (endDate) {
      conditions.push(lte(auditLogs.timestamp, `${endDate}T23:59:59.999Z`));
    }

    const logs = await db
      .select({
        id: auditLogs.id,
        shopId: auditLogs.shopId,
        userId: auditLogs.userId,
        userName: users.name,
        userEmail: users.email,
        userRole: users.role,
        action: auditLogs.action,
        entityType: auditLogs.entityType,
        entityId: auditLogs.entityId,
        detail: auditLogs.detail,
        timestamp: auditLogs.timestamp,
      })
      .from(auditLogs)
      .leftJoin(users, eq(auditLogs.userId, users.id))
      .where(and(...conditions))
      .orderBy(desc(auditLogs.timestamp))
      .limit(limit);

    return NextResponse.json(logs);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to fetch audit logs";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
