import bcrypt from "bcryptjs";
import { client } from "./index";

export async function initDatabase() {
  try {
    // Enable WAL mode & foreign keys for local SQLite (safely catch if Turso ignores WAL)
    try {
      await client.execute("PRAGMA journal_mode = WAL;");
      await client.execute("PRAGMA foreign_keys = ON;");
    } catch {
      // Turso cloud ignores local WAL pragma
    }

    const defaultAdminHash = bcrypt.hashSync("admin123", 10);

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
        is_archived INTEGER NOT NULL DEFAULT 0,
        archived_at DATETIME,
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
      `CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL,
        token TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        used INTEGER NOT NULL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );`,
      `CREATE TABLE IF NOT EXISTS patients (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        phone TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );`,
      `CREATE TABLE IF NOT EXISTS alert_settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        shop_id INTEGER NOT NULL UNIQUE REFERENCES shops(id) ON DELETE CASCADE,
        alert_email TEXT,
        enable_low_stock_emails INTEGER NOT NULL DEFAULT 1,
        enable_incoming_order_emails INTEGER NOT NULL DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );`,
      `CREATE TABLE IF NOT EXISTS email_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
        recipient_email TEXT NOT NULL,
        subject TEXT NOT NULL,
        alert_type TEXT NOT NULL,
        content TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'SENT',
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      );`,
      `CREATE TABLE IF NOT EXISTS sales (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id),
        patient_id INTEGER REFERENCES patients(id) ON DELETE SET NULL,
        patient_name TEXT,
        doctor_name TEXT,
        medicine_id INTEGER NOT NULL REFERENCES medicines(id) ON DELETE CASCADE,
        medicine_name TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        unit_price REAL NOT NULL,
        subtotal REAL NOT NULL DEFAULT 0,
        discount_percent REAL NOT NULL DEFAULT 0,
        discount_amount REAL NOT NULL DEFAULT 0,
        total_price REAL NOT NULL,
        batch_details TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );`,
      `CREATE TABLE IF NOT EXISTS user_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        user_name TEXT,
        session_token TEXT,
        login_time DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_activity DATETIME DEFAULT CURRENT_TIMESTAMP,
        logout_time DATETIME,
        logout_reason TEXT,
        ip_address TEXT,
        user_agent TEXT,
        is_active INTEGER NOT NULL DEFAULT 1
      );`,
      `CREATE INDEX IF NOT EXISTS idx_users_shop ON users(shop_id);`,
      `CREATE INDEX IF NOT EXISTS idx_medicines_shop ON medicines(shop_id);`,
      `CREATE INDEX IF NOT EXISTS idx_medicines_barcode ON medicines(shop_id, barcode);`,
      `CREATE INDEX IF NOT EXISTS idx_batches_shop ON batches(shop_id);`,
      `CREATE INDEX IF NOT EXISTS idx_batches_expiry ON batches(medicine_id, expiry_date);`,
      `CREATE INDEX IF NOT EXISTS idx_patients_shop ON patients(shop_id);`,
      `CREATE INDEX IF NOT EXISTS idx_audit_shop ON audit_logs(shop_id);`,
      `CREATE INDEX IF NOT EXISTS idx_reset_email ON password_reset_tokens(email);`,
      `CREATE INDEX IF NOT EXISTS idx_sessions_user ON user_sessions(user_id);`,
      `CREATE INDEX IF NOT EXISTS idx_sessions_shop ON user_sessions(shop_id);`,
      `INSERT OR IGNORE INTO shops (id, name, address, phone) VALUES (1, 'Apex MedTrack Pharmacy', '123 Health Ave', '+1-800-555-MEDS');`,
      {
        sql: `INSERT OR IGNORE INTO users (id, shop_id, name, email, password_hash, role) VALUES (1, 1, 'Pharmacy Admin', 'admin@medtrack.com', ?, 'owner');`,
        args: [defaultAdminHash],
      }
    ], "write");

    // Dynamic column migrations for SQLite table alterations
    try {
      await client.execute("ALTER TABLE sales ADD COLUMN patient_id INTEGER REFERENCES patients(id) ON DELETE SET NULL;");
    } catch { /* Column may already exist */ }
    try {
      await client.execute("ALTER TABLE sales ADD COLUMN patient_name TEXT;");
    } catch { /* Column may already exist */ }
    try {
      await client.execute("ALTER TABLE sales ADD COLUMN doctor_name TEXT;");
    } catch { /* Column may already exist */ }
    try {
      await client.execute("ALTER TABLE medicines ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0;");
    } catch { /* Column may already exist */ }
    try {
      await client.execute("ALTER TABLE medicines ADD COLUMN archived_at TEXT;");
    } catch { /* Column may already exist */ }
    try {
      await client.execute("CREATE INDEX IF NOT EXISTS idx_medicines_archived ON medicines(shop_id, is_archived);");
    } catch { /* Index may already exist */ }

    // Create index on sales.patient_id only after the column is guaranteed to exist
    try {
      await client.execute("CREATE INDEX IF NOT EXISTS idx_sales_patient ON sales(patient_id);");
    } catch { /* Index may already exist or column race - safe to ignore */ }

    // Seed default sample medicine if cloud database is fresh
    try {
      const medCheck = await client.execute("SELECT COUNT(*) as count FROM medicines;");
      const count = Number(medCheck.rows[0]?.count || 0);
      if (count === 0) {
        await client.execute({
          sql: "INSERT INTO medicines (id, shop_id, name, barcode, manufacturer, schedule, unit_price, reorder_threshold) VALUES (1, 1, 'Paracetamol 500mg (Sample)', '8901234567890', 'Cipla Health', 'OTC', 15.0, 10);",
          args: [],
        });
        await client.execute({
          sql: "INSERT INTO batches (shop_id, medicine_id, batch_number, quantity, expiry_date, supplier, cost_price, received_date) VALUES (1, 1, 'BAT-2026-A', 100, '2028-12-31', 'Apex Med Wholesale', 10.0, '2026-08-01');",
          args: [],
        });
      }
    } catch (e) {
      console.warn("Sample data seed warning:", e);
    }

    return { success: true, message: "Database schema initialized successfully." };
  } catch (err: unknown) {
    console.error("Database initialization error:", err);
    throw err;
  }
}