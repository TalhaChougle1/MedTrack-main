import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { initDatabase } from "@/lib/db/init";
import { shops, users, auditLogs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { validateEmail } from "@/lib/emailValidation";

export async function POST(req: Request) {
  try {
    // Automatically ensure SQLite database tables are initialized
    try {
      await initDatabase();
    } catch (e) {
      console.warn("Auto initDatabase warning:", e);
    }
    const body = await req.json();
    const {
      shopName,
      address,
      phone,
      licenseNumber,
      name,
      email,
      password,
    } = body;

    if (!shopName || !name || !email || !password) {
      return NextResponse.json(
        { error: "Pharmacy name, staff name, email, and password are required." },
        { status: 400 }
      );
    }

    // Strict email formatting, disposable domain & syntax check
    const emailValidation = validateEmail(email);
    if (!emailValidation.isValid) {
      return NextResponse.json(
        { error: emailValidation.error || "Please enter a valid, active email address." },
        { status: 400 }
      );
    }

    const cleanedEmail = email.toLowerCase().trim();

    // Check if email already exists
    const existingUsers = await db
      .select()
      .from(users)
      .where(eq(users.email, cleanedEmail));

    if (existingUsers.length > 0) {
      return NextResponse.json(
        { error: "An account with this email already exists." },
        { status: 400 }
      );
    }

    // Hash password with bcrypt factor 12
    const passwordHash = await bcrypt.hash(password, 12);

    // Insert shop
    const [newShop] = await db
      .insert(shops)
      .values({
        name: shopName.trim(),
        address: address?.trim() || null,
        phone: phone?.trim() || null,
        licenseNumber: licenseNumber?.trim() || null,
      })
      .returning();

    // Insert owner user
    const [newUser] = await db
      .insert(users)
      .values({
        shopId: newShop.id,
        name: name.trim(),
        email: cleanedEmail,
        passwordHash,
        role: "owner",
      })
      .returning();

    // Log registration in audit log
    await db.insert(auditLogs).values({
      shopId: newShop.id,
      userId: newUser.id,
      action: "REGISTER",
      entityType: "shop",
      entityId: newShop.id,
      detail: JSON.stringify({
        shopName: newShop.name,
        ownerEmail: newUser.email,
        ownerName: newUser.name,
      }),
    });

    return NextResponse.json(
      {
        message: "Pharmacy registered successfully.",
        shopId: newShop.id,
        userId: newUser.id,
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    console.error("Registration error:", error);
    const msg = error instanceof Error ? error.message : "Registration failed.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
