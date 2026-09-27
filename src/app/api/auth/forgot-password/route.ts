import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { initDatabase } from "@/lib/db/init";
import { users, passwordResetTokens } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { validateEmail } from "@/lib/emailValidation";
import { sendPasswordResetEmail } from "@/lib/emailService";

export async function POST(req: Request) {
  try {
    try {
      await initDatabase();
    } catch (e) {
      console.warn("Database auto-init warning:", e);
    }

    const body = await req.json();
    const { email } = body;

    if (!email) {
      return NextResponse.json(
        { error: "Email address is required." },
        { status: 400 }
      );
    }

    // 1. Email format and domain validation
    const validation = validateEmail(email);
    if (!validation.isValid) {
      return NextResponse.json(
        { error: validation.error || "Invalid email address format." },
        { status: 400 }
      );
    }

    const cleanedEmail = email.trim().toLowerCase();

    // 2. Check if user account exists
    const existingUsers = await db
      .select()
      .from(users)
      .where(eq(users.email, cleanedEmail));

    if (existingUsers.length === 0) {
      return NextResponse.json(
        { error: "No registered pharmacy account was found with this email address." },
        { status: 404 }
      );
    }

    const user = existingUsers[0];

    // 3. Generate 6-digit OTP token and 15-minute expiration
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 15 * 60 * 1000; // 15 minutes from now

    // 4. Save token to database
    await db.insert(passwordResetTokens).values({
      email: cleanedEmail,
      token: otpCode,
      expiresAt,
      used: false,
    });

    // 5. Send OTP via Brevo — the OTP is handled server-side only and is
    //    NEVER returned in the API response.
    const brevoConfigured =
      Boolean(process.env.BREVO_API_KEY) && Boolean(process.env.EMAIL_FROM);

    if (brevoConfigured) {
      try {
        const emailResult = await sendPasswordResetEmail({
          toEmail: cleanedEmail,
          userName: user.name,
          otpCode,
        });

        if (!emailResult.success) {
          // Brevo rejected the send — still let the user know to check their
          // inbox, but log the real error server-side.
          console.error(
            `[PASSWORD RESET EMAIL FAILED] Could not deliver OTP to ${cleanedEmail}: ${emailResult.error}`
          );
        } else {
          console.log(
            `[PASSWORD RESET EMAIL DISPATCHED] OTP sent to ${cleanedEmail} via Brevo.` +
            (emailResult.messageId ? ` Message ID: ${emailResult.messageId}` : "")
          );
        }
      } catch (emailErr) {
        // Non-fatal: token is already saved, user can re-request if needed.
        console.error("[PASSWORD RESET EMAIL ERROR]", emailErr);
      }
    } else {
      // Brevo is not configured (local dev / CI). Log to console only.
      console.warn(
        `[PASSWORD RESET — DEV MODE] BREVO_API_KEY or EMAIL_FROM not set. ` +
        `OTP for ${cleanedEmail}: ${otpCode} (expires in 15 min)`
      );
    }

    // Mask email for display (e.g. a***n@medtrack.com)
    const emailParts = cleanedEmail.split("@");
    const maskedName =
      emailParts[0].length > 2
        ? `${emailParts[0][0]}***${emailParts[0][emailParts[0].length - 1]}`
        : `${emailParts[0][0]}***`;
    const maskedEmail = `${maskedName}@${emailParts[1]}`;

    // Return only safe fields — never the OTP code
    return NextResponse.json(
      {
        message: "Password reset verification code dispatched successfully. Please check your email.",
        maskedEmail,
        userName: user.name,
        expiresInMinutes: 15,
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    console.error("Forgot password request error:", error);
    const msg =
      error instanceof Error ? error.message : "Failed to process forgot password request.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
