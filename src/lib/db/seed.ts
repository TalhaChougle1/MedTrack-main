import bcrypt from "bcryptjs";
import { db } from "./index";
import { initDatabase } from "./init";
import { shops, users, medicines, batches, incomingOrders, wastageLogs, auditLogs } from "./schema";
import { eq } from "drizzle-orm";

export async function seedDatabase(forceReset = false) {
  console.log("🌱 Initializing database schema...");
  await initDatabase();

  const shopId = 1;

  if (forceReset) {
    console.log("🔄 Resetting database tables...");
    await db.delete(wastageLogs).catch(() => {});
    await db.delete(incomingOrders).catch(() => {});
    await db.delete(auditLogs).catch(() => {});
    await db.delete(batches).catch(() => {});
    await db.delete(medicines).catch(() => {});
    await db.delete(users).catch(() => {});
    await db.delete(shops).catch(() => {});
  }

  // Ensure Shop 1 exists
  const existingShops = await db.select().from(shops).where(eq(shops.id, shopId));
  if (existingShops.length === 0) {
    console.log("🏥 Creating primary pharmacy shop...");
    await db.insert(shops).values({
      id: shopId,
      name: "Apex MedTrack Pharmacy",
      address: "123 Health Ave, Medical District",
      phone: "+1-800-555-MEDS",
      licenseNumber: "DL-2026-MED9988",
    });
  }

  // Ensure default users exist
  const existingUsers = await db.select().from(users).where(eq(users.shopId, shopId));
  let ownerUserId = 1;
  let pharmacistUserId = 2;

  if (existingUsers.length === 0) {
    console.log("👤 Creating default admin and staff users...");
    const ownerHash = bcrypt.hashSync("admin123", 10);
    const pharmacistHash = bcrypt.hashSync("pharmacist123", 10);

    const [adminUser] = await db
      .insert(users)
      .values({
        shopId,
        name: "Pharmacy Owner Admin",
        email: "admin@medtrack.com",
        passwordHash: ownerHash,
        role: "owner",
      })
      .returning();

    const [staffUser] = await db
      .insert(users)
      .values({
        shopId,
        name: "Lead Pharmacist",
        email: "pharmacist@medtrack.com",
        passwordHash: pharmacistHash,
        role: "pharmacist",
      })
      .returning();

    ownerUserId = adminUser?.id || 1;
    pharmacistUserId = staffUser?.id || 2;
  } else {
    ownerUserId = existingUsers[0].id;
    pharmacistUserId = existingUsers[1]?.id || existingUsers[0].id;
  }

  // Seed Medicines if missing
  const existingMeds = await db.select().from(medicines).where(eq(medicines.shopId, shopId));
  if (existingMeds.length > 0 && !forceReset) {
    console.log("ℹ️ Medicines already exist. Skipping seed.");
    return { success: true, message: "Database already contains data." };
  }

  console.log("💊 Seeding sample medicines...");
  const sampleMedicines = [
    {
      name: "Dolo 650 (Paracetamol 650mg)",
      barcode: "8901234567890",
      manufacturer: "Micro Labs Ltd",
      schedule: "OTC",
      unitPrice: 32.5,
      reorderThreshold: 50,
    },
    {
      name: "Mox 500 (Amoxicillin 500mg)",
      barcode: "8902345678901",
      manufacturer: "Sun Pharma",
      schedule: "H",
      unitPrice: 85.0,
      reorderThreshold: 30,
    },
    {
      name: "Okacet 10mg (Cetirizine HCI)",
      barcode: "8903456789012",
      manufacturer: "Cipla Labs",
      schedule: "OTC",
      unitPrice: 24.0,
      reorderThreshold: 20,
    },
    {
      name: "Glycomet 500mg (Metformin)",
      barcode: "8904567890123",
      manufacturer: "USV Private Ltd",
      schedule: "H",
      unitPrice: 45.0,
      reorderThreshold: 40,
    },
    {
      name: "Omez 20mg (Omeprazole)",
      barcode: "8905678901234",
      manufacturer: "Dr. Reddy's Labs",
      schedule: "OTC",
      unitPrice: 62.0,
      reorderThreshold: 25,
    },
    {
      name: "Alprax 0.25mg (Alprazolam)",
      barcode: "8906789012345",
      manufacturer: "Torrent Pharma",
      schedule: "X",
      unitPrice: 78.0,
      reorderThreshold: 15,
    },
    {
      name: "Azithral 500mg (Azithromycin)",
      barcode: "8907890123456",
      manufacturer: "Alembic Pharma",
      schedule: "H1",
      unitPrice: 118.0,
      reorderThreshold: 20,
    },
    {
      name: "Atorva 10mg (Atorvastatin)",
      barcode: "8908901234567",
      manufacturer: "Zydus Healthcare",
      schedule: "H",
      unitPrice: 95.0,
      reorderThreshold: 30,
    },
  ];

  const insertedMeds: any[] = [];
  for (const med of sampleMedicines) {
    const [inserted] = await db
      .insert(medicines)
      .values({
        shopId,
        ...med,
      })
      .returning();
    insertedMeds.push(inserted);
  }

  console.log("📦 Seeding inventory batches...");
  const now = new Date();
  const dateOffset = (days: number) => {
    const d = new Date(now.getTime() + days * 86400000);
    return d.toISOString().split("T")[0];
  };

  const sampleBatches = [
    // Healthy batches
    {
      medicineId: insertedMeds[0].id,
      batchNumber: "PAR-2026-A1",
      quantity: 120,
      expiryDate: dateOffset(180),
      supplier: "MedSupply Wholesale Corp",
      costPrice: 22.0,
    },
    {
      medicineId: insertedMeds[1].id,
      batchNumber: "AMX-2026-B4",
      quantity: 80,
      expiryDate: dateOffset(120),
      supplier: "PharmaDirect Distributors",
      costPrice: 60.0,
    },
    {
      medicineId: insertedMeds[2].id,
      batchNumber: "CET-2026-C2",
      quantity: 150,
      expiryDate: dateOffset(240),
      supplier: "HealthCare Supplies Co",
      costPrice: 15.0,
    },
    // Warning batch (expires in 45 days)
    {
      medicineId: insertedMeds[3].id,
      batchNumber: "MET-2026-W9",
      quantity: 35,
      expiryDate: dateOffset(45),
      supplier: "MedSupply Wholesale Corp",
      costPrice: 30.0,
    },
    // Urgent batch (expires in 5 days)
    {
      medicineId: insertedMeds[4].id,
      batchNumber: "OMZ-2026-U3",
      quantity: 18,
      expiryDate: dateOffset(5),
      supplier: "Dr. Reddy's Direct",
      costPrice: 42.0,
    },
    // Expired batch (expired 10 days ago for alerts demo)
    {
      medicineId: insertedMeds[5].id,
      batchNumber: "ALP-2025-E8",
      quantity: 12,
      expiryDate: dateOffset(-10),
      supplier: "Torrent Special Pharma",
      costPrice: 50.0,
    },
    // Schedule H1 batch
    {
      medicineId: insertedMeds[6].id,
      batchNumber: "AZI-2026-H1",
      quantity: 40,
      expiryDate: dateOffset(90),
      supplier: "Alembic Trade Agency",
      costPrice: 85.0,
    },
  ];

  const insertedBatches: any[] = [];
  for (const batch of sampleBatches) {
    const [b] = await db
      .insert(batches)
      .values({
        shopId,
        ...batch,
      })
      .returning();
    insertedBatches.push(b);
  }

  console.log("🚚 Seeding incoming orders...");
  await db.insert(incomingOrders).values([
    {
      shopId,
      medicineId: insertedMeds[3].id,
      expectedQuantity: 100,
      expectedArrivalDate: dateOffset(3),
      supplier: "USV Distributors",
      status: "pending",
    },
    {
      shopId,
      medicineId: insertedMeds[5].id,
      expectedQuantity: 50,
      expectedArrivalDate: dateOffset(5),
      supplier: "Torrent Special Pharma",
      status: "pending",
    },
  ]);

  console.log("🗑️ Seeding wastage log...");
  await db.insert(wastageLogs).values({
    shopId,
    medicineId: insertedMeds[5].id,
    batchId: insertedBatches[5].id,
    batchNumber: insertedBatches[5].batchNumber,
    quantity: 5,
    reason: "expired",
    performedBy: ownerUserId,
    date: dateOffset(-2),
  });

  console.log("📋 Seeding audit logs...");
  await db.insert(auditLogs).values([
    {
      shopId,
      userId: ownerUserId,
      action: "REGISTER",
      entityType: "shop",
      entityId: shopId,
      detail: JSON.stringify({ message: "Apex MedTrack Pharmacy initialized" }),
    },
    {
      shopId,
      userId: pharmacistUserId,
      action: "STOCK_IN",
      entityType: "batch",
      entityId: insertedBatches[0].id,
      detail: JSON.stringify({
        medicineName: insertedMeds[0].name,
        batchNumber: insertedBatches[0].batchNumber,
        quantity: 120,
      }),
    },
  ]);

  console.log("✅ Seed completed successfully!");
  return {
    success: true,
    message: "Database seeded with default medicines, batches, users, and audit logs.",
    credentials: {
      admin: "admin@medtrack.com / admin123",
      staff: "pharmacist@medtrack.com / pharmacist123",
    },
  };
}
