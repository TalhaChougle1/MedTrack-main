import fs from "fs";
import path from "path";
import { createClient } from "@libsql/client";
import bcrypt from "bcryptjs";

// Load .env.local if present
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
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

const dbUrl = process.env.DATABASE_URL || "file:medtrack.db";
const authToken = process.env.DATABASE_AUTH_TOKEN || undefined;

console.log(`🔌 Connecting to Database: ${dbUrl.startsWith("libsql://") ? "Turso Cloud DB (" + dbUrl + ")" : "Local SQLite (" + dbUrl + ")"}`);

const client = createClient({
  url: dbUrl,
  ...(authToken ? { authToken } : {}),
});

async function main() {
  try {
    console.log("🌱 Initializing schema and seeding default credentials...");
    try {
      await client.execute("PRAGMA journal_mode = WAL;");
      await client.execute("PRAGMA foreign_keys = ON;");
    } catch {}

    const adminHash = bcrypt.hashSync("admin123", 10);
    const staffHash = bcrypt.hashSync("pharmacist123", 10);

    await client.batch([
      `CREATE TABLE IF NOT EXISTS shops (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        address TEXT,
        phone TEXT,
        license_number TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );`,
      `CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'pharmacist',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );`,
      `CREATE TABLE IF NOT EXISTS medicines (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        barcode TEXT,
        manufacturer TEXT NOT NULL,
        schedule TEXT NOT NULL DEFAULT 'OTC',
        unit_price REAL NOT NULL DEFAULT 0,
        reorder_threshold INTEGER NOT NULL DEFAULT 10,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );`,
      `CREATE TABLE IF NOT EXISTS batches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
        medicine_id INTEGER NOT NULL REFERENCES medicines(id) ON DELETE CASCADE,
        batch_number TEXT NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 0,
        expiry_date TEXT NOT NULL,
        supplier TEXT NOT NULL,
        cost_price REAL NOT NULL DEFAULT 0,
        received_date TEXT NOT NULL DEFAULT (DATE('now'))
      );`,
      `CREATE TABLE IF NOT EXISTS incoming_orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
        medicine_id INTEGER NOT NULL REFERENCES medicines(id) ON DELETE CASCADE,
        expected_quantity INTEGER NOT NULL,
        expected_arrival_date TEXT NOT NULL,
        supplier TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );`,
      `CREATE TABLE IF NOT EXISTS wastage_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
        medicine_id INTEGER NOT NULL REFERENCES medicines(id) ON DELETE CASCADE,
        batch_id INTEGER REFERENCES batches(id) ON DELETE SET NULL,
        batch_number TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        reason TEXT NOT NULL,
        performed_by INTEGER REFERENCES users(id),
        date DATETIME DEFAULT CURRENT_TIMESTAMP
      );`,
      `CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id),
        action TEXT NOT NULL,
        entity_type TEXT,
        entity_id INTEGER,
        detail TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      );`,
      `CREATE TABLE IF NOT EXISTS scanner_sessions (
        session_id TEXT PRIMARY KEY,
        shop_id INTEGER NOT NULL,
        paired INTEGER NOT NULL DEFAULT 0,
        last_scanned_barcode TEXT,
        last_scanned_time INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      );`,
      `INSERT OR IGNORE INTO shops (id, name, address, phone) VALUES (1, 'Apex MedTrack Pharmacy', '123 Health Ave', '+1-800-555-MEDS');`,
      {
        sql: `INSERT OR IGNORE INTO users (id, shop_id, name, email, password_hash, role) VALUES (1, 1, 'Pharmacy Owner Admin', 'admin@medtrack.com', ?, 'owner');`,
        args: [adminHash],
      },
      {
        sql: `INSERT OR IGNORE INTO users (id, shop_id, name, email, password_hash, role) VALUES (2, 1, 'Lead Pharmacist', 'pharmacist@medtrack.com', ?, 'pharmacist');`,
        args: [staffHash],
      }
    ], "write");

    console.log("✨ Database schema & authentication records successfully ready!");
    console.log("🔑 Default Owner Login: admin@medtrack.com / admin123");
    console.log("🔑 Default Staff Login: pharmacist@medtrack.com / pharmacist123");
  } catch (err) {
    console.error("❌ Seed CLI Error:", err);
    process.exit(1);
  }
}

main();
