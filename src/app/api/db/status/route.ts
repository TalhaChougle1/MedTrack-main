import { NextResponse } from "next/server";
import { db, getDatabaseConnectionType } from "@/lib/db";
import { medicines, batches, users, shops } from "@/lib/db/schema";
import { sql } from "drizzle-orm";

export async function GET() {
  try {
    const connInfo = getDatabaseConnectionType();

    const [medCount] = await db.select({ count: sql<number>`COUNT(*)` }).from(medicines).catch(() => [{ count: 0 }]);
    const [batchCount] = await db.select({ count: sql<number>`COUNT(*)` }).from(batches).catch(() => [{ count: 0 }]);
    const [userCount] = await db.select({ count: sql<number>`COUNT(*)` }).from(users).catch(() => [{ count: 0 }]);
    const [shopCount] = await db.select({ count: sql<number>`COUNT(*)` }).from(shops).catch(() => [{ count: 0 }]);

    return NextResponse.json({
      success: true,
      connection: {
        isTurso: connInfo.isTurso,
        type: connInfo.isTurso ? "Turso Cloud DB (Remote LibSQL)" : "Local SQLite File",
        url: connInfo.url,
      },
      stats: {
        shops: Number(shopCount?.count || 0),
        users: Number(userCount?.count || 0),
        medicines: Number(medCount?.count || 0),
        batches: Number(batchCount?.count || 0),
      },
      seeded: Number(medCount?.count || 0) > 0,
      defaultCredentials: {
        adminEmail: "admin@medtrack.com",
        pharmacistEmail: "pharmacist@medtrack.com",
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to fetch database status";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
