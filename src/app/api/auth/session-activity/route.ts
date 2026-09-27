import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { userSessions, auditLogs } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";

// Configurable inactivity timeout in seconds (Default: 15 minutes = 900 seconds)
const INACTIVITY_TIMEOUT_SECONDS = 900;
const WARNING_BEFORE_TIMEOUT_SECONDS = 60;

export async function GET(req: Request) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const shopId = session.user.shopId || 1;
  const userId = parseInt(session.user.id);
  const { searchParams } = new URL(req.url);
  const viewAll = searchParams.get("all") === "true";

  try {
    // If owner/admin requested all session history for Phase 7 admin view
    if (viewAll) {
      if (session.user.role !== "owner") {
        return NextResponse.json({ error: "Forbidden. Admin only." }, { status: 403 });
      }

      const allSessions = await db
        .select()
        .from(userSessions)
        .where(eq(userSessions.shopId, shopId))
        .orderBy(desc(userSessions.loginTime))
        .limit(100);

      return NextResponse.json(allSessions);
    }

    // Get current user's most recent active session
    const [active] = await db
      .select()
      .from(userSessions)
      .where(
        and(
          eq(userSessions.userId, userId),
          eq(userSessions.shopId, shopId),
          eq(userSessions.isActive, true)
        )
      )
      .orderBy(desc(userSessions.id))
      .limit(1);

    return NextResponse.json({
      active: !!active,
      loginTime: active?.loginTime || null,
      lastActivity: active?.lastActivity || null,
      timeoutSeconds: INACTIVITY_TIMEOUT_SECONDS,
      warningSeconds: WARNING_BEFORE_TIMEOUT_SECONDS,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to fetch session activity";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST: Heartbeat / User activity ping
export async function POST(req: Request) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const shopId = session.user.shopId || 1;
  const userId = parseInt(session.user.id);
  const nowIso = new Date().toISOString();

  try {
    // Update lastActivity on active session
    const [existing] = await db
      .select()
      .from(userSessions)
      .where(
        and(
          eq(userSessions.userId, userId),
          eq(userSessions.shopId, shopId),
          eq(userSessions.isActive, true)
        )
      )
      .orderBy(desc(userSessions.id))
      .limit(1);

    if (existing) {
      await db
        .update(userSessions)
        .set({ lastActivity: nowIso })
        .where(eq(userSessions.id, existing.id));
    } else {
      // Create session record if not found
      await db.insert(userSessions).values({
        shopId,
        userId,
        userName: session.user.name,
        loginTime: nowIso,
        lastActivity: nowIso,
        isActive: true,
      });
    }

    return NextResponse.json({ success: true, timestamp: nowIso });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to update activity";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// DELETE: Invalidate session with logout reason (manual, timeout, invalidated)
export async function DELETE(req: Request) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ success: true, message: "No active session." });
  }

  const shopId = session.user.shopId || 1;
  const userId = parseInt(session.user.id);
  const nowIso = new Date().toISOString();

  try {
    let reason = "manual";
    try {
      const body = await req.json();
      if (body?.reason) reason = body.reason;
    } catch {
      // default to manual
    }

    // Update active sessions to inactive
    const activeList = await db
      .select()
      .from(userSessions)
      .where(
        and(
          eq(userSessions.userId, userId),
          eq(userSessions.shopId, shopId),
          eq(userSessions.isActive, true)
        )
      );

    for (const s of activeList) {
      await db
        .update(userSessions)
        .set({
          isActive: false,
          logoutTime: nowIso,
          logoutReason: reason,
        })
        .where(eq(userSessions.id, s.id));
    }

    // Insert audit log
    await db.insert(auditLogs).values({
      shopId,
      userId,
      action: reason === "timeout" ? "SESSION_TIMEOUT" : "LOGOUT",
      entityType: "user",
      entityId: userId,
      detail: JSON.stringify({
        userName: session.user.name,
        reason,
        timestamp: nowIso,
      }),
      timestamp: nowIso,
    });

    return NextResponse.json({
      success: true,
      message: `Session invalidated: ${reason}`,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to end session";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
