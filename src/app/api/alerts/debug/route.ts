/**
 * GET /api/alerts/debug
 *
 * Returns the alert settings currently stored in the database for this shop.
 * Use this to verify that "Save Alert Settings" is actually persisting
 * the recipient email to the database.
 *
 * Example: open /api/alerts/debug in your browser after saving settings.
 * You should see the email address you typed.
 *
 * IMPORTANT: This route never exposes BREVO_API_KEY or any secret.
 * It only reads the alert_settings table.
 */
import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { getShopAlertSettings } from "@/lib/emailService";

export async function GET() {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const shopId = session.user.shopId;
  const settings = await getShopAlertSettings(shopId);

  return NextResponse.json({
    shopId,
    savedRecipient:         settings.alertEmail      || "(none — configure in Expiry Alerts → Email Settings)",
    lowStockEmailsEnabled:  settings.enableLowStockEmails,
    incomingOrderEmailsEnabled: settings.enableIncomingOrderEmails,
    note: "This is what the low-stock alert system uses as the recipient. EMAIL_FROM is the sender (set in Vercel env vars).",
  });
}
