import fs from "fs";
import path from "path";
import { createClient } from "@libsql/client";

const envPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  const envText = fs.readFileSync(envPath, "utf8");
  for (const line of envText.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const idx = trimmed.indexOf("=");
      if (idx > 0) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim();
        if (!process.env[key]) process.env[key] = val;
      }
    }
  }
}

const client = createClient({
  url: process.env.DATABASE_URL || "file:medtrack.db",
  authToken: process.env.DATABASE_AUTH_TOKEN || undefined,
});

async function main() {
  console.log("🧹 Purging test scanned medicine from Turso DB & local SQLite...");
  const res = await client.execute("DELETE FROM medicines WHERE barcode = '8901296060667' OR name LIKE '%Scanned Medicine%';");
  console.log(`✅ Purged successfully! Affected rows: ${res.rowsAffected}`);
}

main();
