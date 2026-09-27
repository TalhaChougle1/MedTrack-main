import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { initDatabase } from "@/lib/db/init";
import { users, passwordResetTokens, auditLogs } from "@/lib/db/schema";
import { eq, and, gte, desc } from "drizzle-orm";
import { validateEmail } from "@/lib/emailValidation";

export async function POST(req: Request) {
  try {
    try {
      await initDatabase();
    } catch (e) {
      console.warn("Database auto-init warning:", e);
    }

    const body = await req.json();
    const { email, token, newPassword } = body;

    if (!email || !token || !newPassword) {
      return NextResponse.json(
        { error: "Email, verification code, and new password are required." },
        { status: 400 }
      );
    }

    // 1. Email format check
    const validation = validateEmail(email);
    if (!validation.isValid) {
      return NextResponse.json(
        { error: validation.error || "Invalid email address format." },
        { status: 400 }
      );
    }

    const cleanedEmail = email.trim().toLowerCase();
    const cleanedToken = token.trim();

    // 2. Validate password complexity (Minimum 8 chars, must contain letters and numbers)
    if (newPassword.length < 8) {
      return NextResponse.json(
        { error: "New password must be at least 8 characters long." },
        { status: 400 }
      );
    }

    const hasLetter = /[a-zA-Z]/.test(newPassword);
    const hasNumber = /[0-9]/.test(newPassword);
    if (!hasLetter || !hasNumber) {
      return NextResponse.json(
        { error: "Password must contain both letters and numbers for adequate security." },
        { status: 400 }
      );
    }

    // 3. Find matching active reset token
    const now = Date.now();
    const activeTokens = await db
      .select()
      .from(passwordResetTokens)
      .where(
        and(
          eq(passwordResetTokens.email, cleanedEmail),
          eq(passwordResetTokens.token, cleanedToken),
          eq(passwordResetTokens.used, false),
          gte(passwordResetTokens.expiresAt, now)
        )
      )
      .orderBy(desc(passwordResetTokens.id));

    if (activeTokens.length === 0) {
      return NextResponse.json(
        { error: "Invalid or expired verification code. Please request a new code." },
        { status: 400 }
      );
    }

    const tokenRecord = activeTokens[0];

    // 4. Find user account
    const existingUsers = await db
      .select()
      .from(users)
      .where(eq(users.email, cleanedEmail));

    if (existingUsers.length === 0) {
      return NextResponse.json(
        { error: "User account not found." },
        { status: 404 }
      );
    }

    const user = existingUsers[0];

    // 5. Hash new password and update user record
    const newPasswordHash = await bcrypt.hash(newPassword, 12);

    await db
      .update(users)
      .set({ passwordHash: newPasswordHash })
      .where(eq(users.id, user.id));

    // 6. Invalidate reset token
    await db
      .update(passwordResetTokens)
      .set({ used: true })
      .where(eq(passwordResetTokens.id, tokenRecord.id));

    // 7. Record in audit logs
    await db.insert(auditLogs).values({
      shopId: user.shopId,
      userId: user.id,
      action: "PASSWORD_RESET",
      entityType: "user",
      entityId: user.id,
      detail: JSON.stringify({
        email: user.email,
        name: user.name,
        resetTimestamp: new Date().toISOString(),
      }),
    });

    return NextResponse.json(
      {
        message: "Password reset successful! You can now sign in with your new password.",
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    console.error("Reset password error:", error);
    const msg = error instanceof Error ? error.message : "Failed to reset password.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
