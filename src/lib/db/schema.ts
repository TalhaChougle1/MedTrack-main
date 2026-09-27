import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const shops = sqliteTable("shops", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  address: text("address"),
  phone: text("phone"),
  licenseNumber: text("license_number"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
});

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  shopId: integer("shop_id")
    .notNull()
    .references(() => shops.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").default("pharmacist").notNull(), // owner | pharmacist
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
});

export const medicines = sqliteTable("medicines", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  shopId: integer("shop_id")
    .notNull()
    .references(() => shops.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  barcode: text("barcode"), // nullable, unique per shop checked programmatically
  manufacturer: text("manufacturer").notNull(),
  schedule: text("schedule").default("OTC").notNull(), // OTC | H | H1 | X
  unitPrice: real("unit_price").default(0).notNull(),
  reorderThreshold: integer("reorder_threshold").default(10).notNull(),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
});

export const batches = sqliteTable("batches", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  shopId: integer("shop_id")
    .notNull()
    .references(() => shops.id, { onDelete: "cascade" }),
  medicineId: integer("medicine_id")
    .notNull()
    .references(() => medicines.id, { onDelete: "cascade" }),
  batchNumber: text("batch_number").notNull(),
  quantity: integer("quantity").default(0).notNull(),
  expiryDate: text("expiry_date").notNull(), // YYYY-MM-DD
  supplier: text("supplier").notNull(),
  costPrice: real("cost_price").default(0).notNull(),
  receivedDate: text("received_date").default(sql`CURRENT_DATE`).notNull(),
});

export const incomingOrders = sqliteTable("incoming_orders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  shopId: integer("shop_id")
    .notNull()
    .references(() => shops.id, { onDelete: "cascade" }),
  medicineId: integer("medicine_id")
    .notNull()
    .references(() => medicines.id, { onDelete: "cascade" }),
  expectedQuantity: integer("expected_quantity").notNull(),
  expectedArrivalDate: text("expected_arrival_date").notNull(), // YYYY-MM-DD
  supplier: text("supplier").notNull(),
  status: text("status").default("pending").notNull(), // pending | arrived | delayed
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
});

export const wastageLogs = sqliteTable("wastage_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  shopId: integer("shop_id")
    .notNull()
    .references(() => shops.id, { onDelete: "cascade" }),
  medicineId: integer("medicine_id")
    .notNull()
    .references(() => medicines.id, { onDelete: "cascade" }),
  batchId: integer("batch_id").references(() => batches.id, { onDelete: "set null" }),
  batchNumber: text("batch_number").notNull(), // Stored as text for audit durability
  quantity: integer("quantity").notNull(),
  reason: text("reason").notNull(), // expired | damaged | contaminated | recalled | other
  performedBy: integer("performed_by").references(() => users.id),
  date: text("date").default(sql`CURRENT_TIMESTAMP`),
});

export const auditLogs = sqliteTable("audit_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  shopId: integer("shop_id")
    .notNull()
    .references(() => shops.id, { onDelete: "cascade" }),
  userId: integer("user_id").references(() => users.id),
  action: text("action").notNull(), // SELL, STOCK_IN, WASTAGE, ORDER_CREATE, MEDICINE_ADD, REGISTER, STATUS_UPDATE
  entityType: text("entity_type"), // medicine, batch, order, user
  entityId: integer("entity_id"),
  detail: text("detail"), // JSON string
  timestamp: text("timestamp").default(sql`CURRENT_TIMESTAMP`),
});

export const scannerSessions = sqliteTable("scanner_sessions", {
  sessionId: text("session_id").primaryKey(),
  shopId: integer("shop_id").notNull(),
  paired: integer("paired", { mode: "boolean" }).default(false).notNull(),
  lastScannedBarcode: text("last_scanned_barcode"),
  lastScannedTime: integer("last_scanned_time").default(0).notNull(),
  createdAt: integer("created_at").notNull(),
});

export const patients = sqliteTable("patients", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  shopId: integer("shop_id")
    .notNull()
    .references(() => shops.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  phone: text("phone"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
});

export const alertSettings = sqliteTable("alert_settings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  shopId: integer("shop_id")
    .notNull()
    .unique()
    .references(() => shops.id, { onDelete: "cascade" }),
  alertEmail: text("alert_email"),
  enableLowStockEmails: integer("enable_low_stock_emails", { mode: "boolean" }).default(true).notNull(),
  enableIncomingOrderEmails: integer("enable_incoming_order_emails", { mode: "boolean" }).default(true).notNull(),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
});

export const emailLogs = sqliteTable("email_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  shopId: integer("shop_id")
    .notNull()
    .references(() => shops.id, { onDelete: "cascade" }),
  recipientEmail: text("recipient_email").notNull(),
  subject: text("subject").notNull(),
  alertType: text("alert_type").notNull(), // LOW_STOCK | INCOMING_ORDER
  content: text("content").notNull(),
  status: text("status").default("SENT").notNull(),
  timestamp: text("timestamp").default(sql`CURRENT_TIMESTAMP`),
});

export const sales = sqliteTable("sales", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  shopId: integer("shop_id")
    .notNull()
    .references(() => shops.id, { onDelete: "cascade" }),
  userId: integer("user_id").references(() => users.id),
  patientId: integer("patient_id").references(() => patients.id, { onDelete: "set null" }),
  patientName: text("patient_name"),
  doctorName: text("doctor_name"),
  medicineId: integer("medicine_id")
    .notNull()
    .references(() => medicines.id, { onDelete: "cascade" }),
  medicineName: text("medicine_name").notNull(),
  quantity: integer("quantity").notNull(),
  unitPrice: real("unit_price").notNull(),
  subtotal: real("subtotal").default(0).notNull(),
  discountPercent: real("discount_percent").default(0).notNull(),
  discountAmount: real("discount_amount").default(0).notNull(),
  totalPrice: real("total_price").notNull(),
  batchDetails: text("batch_details"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
});

export const passwordResetTokens = sqliteTable("password_reset_tokens", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull(),
  token: text("token").notNull(),
  expiresAt: integer("expires_at").notNull(), // Epoch ms
  used: integer("used", { mode: "boolean" }).default(false).notNull(),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
});

export const userSessions = sqliteTable("user_sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  shopId: integer("shop_id")
    .notNull()
    .references(() => shops.id, { onDelete: "cascade" }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  userName: text("user_name"),
  sessionToken: text("session_token"),
  loginTime: text("login_time").default(sql`CURRENT_TIMESTAMP`),
  lastActivity: text("last_activity").default(sql`CURRENT_TIMESTAMP`),
  logoutTime: text("logout_time"),
  logoutReason: text("logout_reason"), // manual | timeout | invalidated
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  isActive: integer("is_active", { mode: "boolean" }).default(true).notNull(),
});



