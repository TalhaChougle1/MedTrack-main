import fs from "fs";
import path from "path";
import { db } from "./index";
import { medicines, batches, wastageLogs, auditLogs } from "./schema";
import { eq } from "drizzle-orm";

const STORE_PATH =
  process.env.VERCEL === "1"
    ? "/tmp/medtrack_backup.json"
    : path.join(process.cwd(), "medtrack_backup.json");

interface BackupData {
  medicines: any[];
  batches: any[];
  wastageLogs: any[];
  auditLogs: any[];
}

export function saveSnapshotToDisk(data: BackupData) {
  try {
    (globalThis as any).__MEDTRACK_CACHE__ = data;
    fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2), "utf8");
  } catch (e) {
    console.warn("Failed to write backup snapshot:", e);
  }
}

export function loadSnapshotFromDisk(): BackupData | null {
  try {
    if ((globalThis as any).__MEDTRACK_CACHE__) {
      return (globalThis as any).__MEDTRACK_CACHE__;
    }
    if (fs.existsSync(STORE_PATH)) {
      const raw = fs.readFileSync(STORE_PATH, "utf8");
      const parsed = JSON.parse(raw);
      (globalThis as any).__MEDTRACK_CACHE__ = parsed;
      return parsed;
    }
  } catch (e) {
    console.warn("Failed to read backup snapshot:", e);
  }
  return null;
}

export async function persistCurrentDatabaseState() {
  try {
    const allMeds = await db.select().from(medicines);
    const allBatches = await db.select().from(batches);
    const allWastage = await db.select().from(wastageLogs);
    const allAudit = await db.select().from(auditLogs);

    saveSnapshotToDisk({
      medicines: allMeds,
      batches: allBatches,
      wastageLogs: allWastage,
      auditLogs: allAudit,
    });
  } catch (e) {
    console.warn("Failed to persist database state:", e);
  }
}

export async function syncAndRestoreDatabase() {
  try {
    // Keep in-memory cache aligned with database state without resurrecting deleted records
    await persistCurrentDatabaseState();
  } catch (e) {
    console.warn("Database sync error:", e);
  }
}
