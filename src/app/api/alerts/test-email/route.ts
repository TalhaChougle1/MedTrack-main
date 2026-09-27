import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { emailLogs } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getShopAlertSettings, sendBrevoEmail } from "@/lib/emailService";

// ─── POST /api/alerts/test-email ─────────────────────────────────────────────
// Sends a real Brevo test email to the currently saved alert recipient.
// Useful for verifying the end-to-end delivery chain after changing the email.
export async function POST() {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const shopId = session.user.shopId;

  try {
    const settings = await getShopAlertSettings(shopId);

    if (!settings.alertEmail) {
      return NextResponse.json(
        { error: "No alert email address is configured. Save one first in Email Alert Settings." },
        { status: 400 }
      );
    }

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
        <div style="background: #0f766e; padding: 12px 20px; border-radius: 8px; color: #ffffff;">
          <h2 style="margin: 0; font-size: 18px;">✅ MedTrack Email Alert — Connection Test</h2>
        </div>
        <p style="color: #334155; font-size: 15px; margin-top: 16px;">Hello Pharmacy Staff,</p>
        <p style="color: #334155; font-size: 14px;">
          This is a <strong>test email</strong> sent from MedTrack to verify that the email alert system is
          correctly connected to <strong>${settings.alertEmail}</strong>.
        </p>
        <p style="color: #334155; font-size: 14px;">
          If you received this, the configuration is working correctly. Future automatic low-stock alerts
          will be delivered to this address.
        </p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
        <p style="font-size: 11px; color: #94a3b8; text-align: center;">
          Sent by MedTrack FEFO Pharmacy Management System &bull; ${new Date().toLocaleString()}
        </p>
      </div>
    `;

    const result = await sendBrevoEmail({
      to: settings.alertEmail,
      subject: "✅ MedTrack Email Alert Test — Configuration Verified",
      htmlContent,
    });

    if (!result.success) {
      console.error(`[TEST EMAIL FAILED] ${result.error}`);
      return NextResponse.json(
        { error: `Brevo rejected the email: ${result.error}` },
        { status: 502 }
      );
    }

    console.log(
      `[TEST EMAIL SENT] Delivered to "${settings.alertEmail}"` +
      (result.messageId ? ` — Message ID: ${result.messageId}` : "")
    );

    return NextResponse.json({
      success: true,
      recipient: settings.alertEmail,
      messageId: result.messageId,
      message: `Test email sent to ${settings.alertEmail}. Check your inbox (and spam folder).`,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Test email failed";
    console.error("[TEST EMAIL ERROR]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─── DELETE /api/alerts/test-email ───────────────────────────────────────────
// Clears all SENT low-stock alert logs for this shop so the next stock-drop
// event triggers a fresh email.  Useful after changing the recipient email
// or for testing — without this, the duplicate-suppression logic will block
// re-sending while stock is still below threshold.
export async function DELETE() {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const shopId = session.user.shopId;

  try {
    // Delete SENT and FAILED logs so the next low-stock event fires afresh.
    // RECOVERY markers are also cleared — they are internal bookkeeping and
    // are no longer needed once the SENT logs are gone.
    await db
      .delete(emailLogs)
      .where(
        and(
          eq(emailLogs.shopId, shopId),
          eq(emailLogs.alertType, "LOW_STOCK")
        )
      );

    console.log(`[ALERT STATE RESET] All LOW_STOCK email logs cleared for shopId=${shopId}.`);

    return NextResponse.json({
      success: true,
      message: "Alert state reset. The next low-stock event will trigger a fresh email alert.",
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Reset failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
