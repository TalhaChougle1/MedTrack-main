import { db } from "@/lib/db";
import { alertSettings, emailLogs, users } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";

export interface AlertSettingsData {
  alertEmail: string;
  enableLowStockEmails: boolean;
  enableIncomingOrderEmails: boolean;
}

// ---------------------------------------------------------------------------
// Brevo transactional email helper
// All secrets are read server-side only.  Never expose BREVO_API_KEY to the
// client or return it in any response.
// ---------------------------------------------------------------------------

interface BrevoEmailParams {
  to: string;
  subject: string;
  htmlContent: string;
}

interface BrevoSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
  httpStatus?: number;
}

export async function sendBrevoEmail(params: BrevoEmailParams): Promise<BrevoSendResult> {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.EMAIL_FROM;
  const senderName = process.env.BREVO_SENDER_NAME || "MedTrack";

  if (!apiKey) {
    const msg = "BREVO_API_KEY environment variable is not set.";
    console.error("[EMAIL CONFIG ERROR]", msg);
    throw new Error(msg);
  }

  if (!senderEmail) {
    const msg = "EMAIL_FROM environment variable is not set.";
    console.error("[EMAIL CONFIG ERROR]", msg);
    throw new Error(msg);
  }

  const payload = {
    sender: {
      name: senderName,
      email: senderEmail,
    },
    to: [{ email: params.to }],
    subject: params.subject,
    htmlContent: params.htmlContent,
  };

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "api-key": apiKey,
    },
    body: JSON.stringify(payload),
  });

  const responseBody = await response.text();

  if (!response.ok) {
    const errMsg = `Brevo API error ${response.status}: ${responseBody}`;
    console.error(`[EMAIL ALERT FAILED] Brevo ${response.status}: ${responseBody}`);
    return { success: false, error: errMsg, httpStatus: response.status };
  }

  // Parse the Brevo response to capture the messageId
  let messageId: string | undefined;
  try {
    const parsed = JSON.parse(responseBody);
    messageId = parsed.messageId;
  } catch {
    // Not critical — Brevo accepted the request either way
  }

  return { success: true, messageId };
}

// ---------------------------------------------------------------------------
// Alert settings helpers
// ---------------------------------------------------------------------------

/**
 * Retrieves or initialises default alert settings for a shop.
 */
export async function getShopAlertSettings(shopId: number): Promise<AlertSettingsData> {
  try {
    const existing = await db
      .select()
      .from(alertSettings)
      .where(eq(alertSettings.shopId, shopId));

    if (existing.length > 0) {
      const s = existing[0];
      const result = {
        alertEmail: s.alertEmail || "",
        enableLowStockEmails: Boolean(s.enableLowStockEmails),
        enableIncomingOrderEmails: Boolean(s.enableIncomingOrderEmails),
      };
      console.log(
        `[ALERT SETTINGS] shopId=${shopId} → recipient="${result.alertEmail}" ` +
        `lowStock=${result.enableLowStockEmails} incomingOrder=${result.enableIncomingOrderEmails}`
      );
      return result;
    }

    // No row yet — seed a default row using the shop owner's email
    const shopUsers = await db
      .select()
      .from(users)
      .where(eq(users.shopId, shopId));

    const defaultEmail = shopUsers.length > 0 ? shopUsers[0].email : "";

    await db.insert(alertSettings).values({
      shopId,
      alertEmail: defaultEmail,
      enableLowStockEmails: true,
      enableIncomingOrderEmails: true,
    });

    console.log(
      `[ALERT SETTINGS] shopId=${shopId} → no saved settings found, ` +
      `seeded default recipient="${defaultEmail}"`
    );

    return {
      alertEmail: defaultEmail,
      enableLowStockEmails: true,
      enableIncomingOrderEmails: true,
    };
  } catch (err) {
    console.error("[ALERT SETTINGS] Error fetching alert settings:", err);
    return {
      alertEmail: "",
      enableLowStockEmails: true,
      enableIncomingOrderEmails: true,
    };
  }
}

// ---------------------------------------------------------------------------
// Duplicate-alert prevention
// ---------------------------------------------------------------------------
// An alert for a given medicine (LOW_STOCK) is suppressed if a SENT log
// already exists for that shopId + subject since the stock last recovered
// above the threshold.  We implement this simply: check whether the most
// recent email_log for this shop+medicineName is a SENT low-stock alert.
// If it is, we skip sending again.  An alert fires again only after the
// stock has recovered (a RECOVERY log is inserted when stock goes back above
// threshold) OR no prior SENT log exists.
// ---------------------------------------------------------------------------

async function hasPendingLowStockAlert(
  shopId: number,
  medicineName: string,
  currentRecipient: string,
): Promise<boolean> {
  try {
    const logs = await db
      .select()
      .from(emailLogs)
      .where(
        and(
          eq(emailLogs.shopId, shopId),
          eq(emailLogs.alertType, "LOW_STOCK")
        )
      )
      .orderBy(desc(emailLogs.timestamp))
      .limit(50);

    for (const log of logs) {
      if (!log.subject.includes(medicineName)) continue;

      if (log.status === "SENT") {
        // If the previous alert was sent to a DIFFERENT address than the one
        // currently configured, treat it as no pending alert — the recipient
        // has changed and deserves a fresh notification.
        if (log.recipientEmail && log.recipientEmail !== currentRecipient) {
          console.log(
            `[DUPLICATE CHECK] Previous SENT log for "${medicineName}" was to ` +
            `"${log.recipientEmail}" but current recipient is "${currentRecipient}" — ` +
            `allowing fresh alert.`
          );
          return false;
        }
        return true;
      }

      if (log.status === "RECOVERY") {
        return false;
      }

      if (log.status === "FAILED") {
        return false;
      }
    }

    // No prior log for this medicine — allow sending.
    return false;
  } catch (err) {
    console.error("Duplicate alert check error:", err);
    return false; // On error, allow the email to be sent rather than silently dropping it
  }
}

/**
 * Call this when stock recovers above the reorder threshold.
 * Inserts a RECOVERY marker so the next drop triggers a fresh alert.
 */
export async function recordStockRecovery(params: {
  shopId: number;
  medicineName: string;
  currentStock: number;
  reorderThreshold: number;
  recipientEmail: string;
}): Promise<void> {
  try {
    const subject = `✅ STOCK RECOVERED: ${params.medicineName}`;
    const content = `Stock for ${params.medicineName} has recovered to ${params.currentStock} units (threshold: ${params.reorderThreshold}).`;

    await db.insert(emailLogs).values({
      shopId: params.shopId,
      recipientEmail: params.recipientEmail,
      subject,
      alertType: "LOW_STOCK",
      content,
      status: "RECOVERY",
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    // Non-critical — log and continue
    console.error("Failed to record stock recovery marker:", err);
  }
}

// ---------------------------------------------------------------------------
// Low-stock alert
// ---------------------------------------------------------------------------

/**
 * Sends a low-stock alert email via Brevo.
 * Only records SENT if Brevo accepts the message.
 * Records FAILED if Brevo rejects it.
 * Suppresses duplicate alerts while stock remains below threshold.
 */
export async function sendLowStockAlertEmail(params: {
  shopId: number;
  medicineName: string;
  currentStock: number;
  reorderThreshold: number;
  manufacturer?: string;
  batchInfo?: string;
}) {
  const { shopId, medicineName, currentStock, reorderThreshold, manufacturer, batchInfo } = params;

  console.log(
    `[LOW STOCK CHECK] medicine="${medicineName}" stock=${currentStock} threshold=${reorderThreshold} shopId=${shopId}`
  );

  try {
    const settings = await getShopAlertSettings(shopId);

    if (!settings.enableLowStockEmails) {
      console.warn(`[LOW STOCK SKIPPED] Low stock emails are DISABLED for shopId=${shopId}.`);
      return { sent: false, reason: "Low stock email alerts are disabled." };
    }

    if (!settings.alertEmail) {
      console.warn(
        `[LOW STOCK SKIPPED] No alert email configured for shopId=${shopId}. ` +
        `Go to Expiry Alerts → Email Alert Settings and save a recipient address.`
      );
      return { sent: false, reason: "No alert email address configured." };
    }

    console.log(`[LOW STOCK] Will attempt to send alert to "${settings.alertEmail}"`);

    // Duplicate-alert prevention (passes current recipient so a changed address
    // always allows a fresh notification)
    const alreadyAlerted = await hasPendingLowStockAlert(shopId, medicineName, settings.alertEmail);
    if (alreadyAlerted) {
      console.log(
        `[EMAIL ALERT SKIPPED] Duplicate suppressed for ${medicineName} — stock still below threshold and a SENT alert already exists.`
      );
      return { sent: false, reason: "Duplicate alert suppressed." };
    }

    const isOutOfStock = currentStock <= 0;

    const alertSubject = isOutOfStock
      ? `🚨 CRITICAL OUT OF STOCK ALERT: ${medicineName}`
      : `⚠️ LOW STOCK ALERT: ${medicineName}`;

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
        <div style="background: ${isOutOfStock ? "#ef4444" : "#f59e0b"}; padding: 12px 20px; border-radius: 8px; color: #ffffff;">
          <h2 style="margin: 0; font-size: 18px;">${isOutOfStock ? "OUT OF STOCK WARNING" : "LOW MEDICINE STOCK ALERT"}</h2>
        </div>
        <p style="color: #334155; font-size: 15px; margin-top: 16px;">Hello Pharmacy Staff,</p>
        <p style="color: #334155; font-size: 14px;">
          This is an automated inventory alert from <strong>MedTrack FEFO System</strong>.
          The medicine <strong>${medicineName}</strong> has reached or dropped below its configured low-stock alert threshold.
        </p>
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 14px;">
          <tr style="background: #f8fafc;">
            <td style="padding: 10px; border: 1px solid #cbd5e1; font-weight: bold;">Medicine Name:</td>
            <td style="padding: 10px; border: 1px solid #cbd5e1;">${medicineName}</td>
          </tr>
          ${manufacturer ? `
          <tr>
            <td style="padding: 10px; border: 1px solid #cbd5e1; font-weight: bold;">Manufacturer:</td>
            <td style="padding: 10px; border: 1px solid #cbd5e1;">${manufacturer}</td>
          </tr>` : ""}
          ${batchInfo ? `
          <tr style="background: #f8fafc;">
            <td style="padding: 10px; border: 1px solid #cbd5e1; font-weight: bold;">Batch Info:</td>
            <td style="padding: 10px; border: 1px solid #cbd5e1;">${batchInfo}</td>
          </tr>` : ""}
          <tr style="${batchInfo ? "" : "background: #f8fafc;"}">
            <td style="padding: 10px; border: 1px solid #cbd5e1; font-weight: bold;">Current Available Stock:</td>
            <td style="padding: 10px; border: 1px solid #cbd5e1; font-weight: bold; color: ${isOutOfStock ? "#dc2626" : "#d97706"};">
              ${currentStock} units
            </td>
          </tr>
          <tr>
            <td style="padding: 10px; border: 1px solid #cbd5e1; font-weight: bold;">Low Stock Alert Threshold:</td>
            <td style="padding: 10px; border: 1px solid #cbd5e1;">${reorderThreshold} units</td>
          </tr>
          <tr style="background: #f8fafc;">
            <td style="padding: 10px; border: 1px solid #cbd5e1; font-weight: bold;">Status:</td>
            <td style="padding: 10px; border: 1px solid #cbd5e1; font-weight: bold; color: #dc2626;">
              Stock has reached the configured low-stock alert threshold. Please review and reorder if required.
            </td>
          </tr>
        </table>
        <p style="color: #475569; font-size: 13px;">
          Please place a restock order in the <strong>Restock Module</strong> to avoid stockouts.
        </p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
        <p style="font-size: 11px; color: #94a3b8; text-align: center;">
          Sent by MedTrack FEFO Pharmacy Management System &bull; ${new Date().toLocaleString()}
        </p>
      </div>
    `;

    // Call Brevo — only record SENT if this actually succeeds
    let brevoResult: BrevoSendResult;
    try {
      brevoResult = await sendBrevoEmail({
        to: settings.alertEmail,
        subject: alertSubject,
        htmlContent,
      });
    } catch (brevoErr) {
      // sendBrevoEmail throws on missing env vars; treat as FAILED
      const errMsg = brevoErr instanceof Error ? brevoErr.message : String(brevoErr);
      await db.insert(emailLogs).values({
        shopId,
        recipientEmail: settings.alertEmail,
        subject: alertSubject,
        alertType: "LOW_STOCK",
        content: htmlContent,
        status: "FAILED",
        timestamp: new Date().toISOString(),
      });
      console.error(`[EMAIL ALERT FAILED] ${errMsg}`);
      return { sent: false, error: errMsg };
    }

    if (!brevoResult.success) {
      // Brevo rejected — record FAILED
      await db.insert(emailLogs).values({
        shopId,
        recipientEmail: settings.alertEmail,
        subject: alertSubject,
        alertType: "LOW_STOCK",
        content: htmlContent,
        status: "FAILED",
        timestamp: new Date().toISOString(),
      });
      return { sent: false, error: brevoResult.error };
    }

    // Brevo accepted — record SENT
    await db.insert(emailLogs).values({
      shopId,
      recipientEmail: settings.alertEmail,
      subject: alertSubject,
      alertType: "LOW_STOCK",
      content: htmlContent,
      status: "SENT",
      timestamp: new Date().toISOString(),
    });

    console.log(
      `[EMAIL ALERT DISPATCHED] Low stock alert for ${medicineName} accepted by Brevo.` +
      ` Recipient: ${settings.alertEmail}.` +
      (brevoResult.messageId ? ` Message ID: ${brevoResult.messageId}` : "")
    );

    return {
      sent: true,
      recipient: settings.alertEmail,
      subject: alertSubject,
      messageId: brevoResult.messageId,
    };
  } catch (err) {
    console.error("[EMAIL ALERT FAILED] Unexpected error in sendLowStockAlertEmail:", err);
    return { sent: false, error: String(err) };
  }
}

// ---------------------------------------------------------------------------
// Incoming order alert
// ---------------------------------------------------------------------------

/**
 * Sends an incoming-order confirmation email via Brevo.
 * Only records SENT if Brevo accepts the message.
 * Records FAILED if Brevo rejects it.
 */
export async function sendIncomingOrderAlertEmail(params: {
  shopId: number;
  medicineName: string;
  expectedQuantity: number;
  expectedArrivalDate: string;
  supplier: string;
  status: string;
}) {
  const { shopId, medicineName, expectedQuantity, expectedArrivalDate, supplier, status } = params;

  try {
    const settings = await getShopAlertSettings(shopId);

    if (!settings.enableIncomingOrderEmails) {
      return { sent: false, reason: "Incoming order email alerts are disabled." };
    }

    if (!settings.alertEmail) {
      return { sent: false, reason: "No alert email address configured." };
    }

    const alertSubject = `📦 INCOMING MEDICINE STOCK ORDER: ${medicineName} (${expectedQuantity} units)`;

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
        <div style="background: #0284c7; padding: 12px 20px; border-radius: 8px; color: #ffffff;">
          <h2 style="margin: 0; font-size: 18px;">INCOMING MEDICINE STOCK ORDER CONFIRMATION</h2>
        </div>
        <p style="color: #334155; font-size: 15px; margin-top: 16px;">Hello Pharmacy Staff,</p>
        <p style="color: #334155; font-size: 14px;">
          An incoming stock order has been registered in your pharmacy system. Here are the order details:
        </p>
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 14px;">
          <tr style="background: #f8fafc;">
            <td style="padding: 10px; border: 1px solid #cbd5e1; font-weight: bold;">Medicine Name:</td>
            <td style="padding: 10px; border: 1px solid #cbd5e1;">${medicineName}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border: 1px solid #cbd5e1; font-weight: bold;">Ordered Quantity:</td>
            <td style="padding: 10px; border: 1px solid #cbd5e1; font-weight: bold; color: #0284c7;">${expectedQuantity} units</td>
          </tr>
          <tr style="background: #f8fafc;">
            <td style="padding: 10px; border: 1px solid #cbd5e1; font-weight: bold;">Supplier:</td>
            <td style="padding: 10px; border: 1px solid #cbd5e1;">${supplier}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border: 1px solid #cbd5e1; font-weight: bold;">Expected Arrival Date:</td>
            <td style="padding: 10px; border: 1px solid #cbd5e1; font-weight: bold;">${expectedArrivalDate}</td>
          </tr>
          <tr style="background: #f8fafc;">
            <td style="padding: 10px; border: 1px solid #cbd5e1; font-weight: bold;">Order Status:</td>
            <td style="padding: 10px; border: 1px solid #cbd5e1; text-transform: uppercase; font-weight: bold; color: #0369a1;">${status}</td>
          </tr>
        </table>
        <p style="color: #475569; font-size: 13px;">
          You can track this order and update its status upon receiving the batch delivery under the <strong>Restock Module</strong>.
        </p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
        <p style="font-size: 11px; color: #94a3b8; text-align: center;">
          Sent by MedTrack FEFO Pharmacy Management System &bull; ${new Date().toLocaleString()}
        </p>
      </div>
    `;

    // Call Brevo — only record SENT if this actually succeeds
    let brevoResult: BrevoSendResult;
    try {
      brevoResult = await sendBrevoEmail({
        to: settings.alertEmail,
        subject: alertSubject,
        htmlContent,
      });
    } catch (brevoErr) {
      const errMsg = brevoErr instanceof Error ? brevoErr.message : String(brevoErr);
      await db.insert(emailLogs).values({
        shopId,
        recipientEmail: settings.alertEmail,
        subject: alertSubject,
        alertType: "INCOMING_ORDER",
        content: htmlContent,
        status: "FAILED",
        timestamp: new Date().toISOString(),
      });
      console.error(`[EMAIL ALERT FAILED] ${errMsg}`);
      return { sent: false, error: errMsg };
    }

    if (!brevoResult.success) {
      await db.insert(emailLogs).values({
        shopId,
        recipientEmail: settings.alertEmail,
        subject: alertSubject,
        alertType: "INCOMING_ORDER",
        content: htmlContent,
        status: "FAILED",
        timestamp: new Date().toISOString(),
      });
      return { sent: false, error: brevoResult.error };
    }

    // Brevo accepted — record SENT
    await db.insert(emailLogs).values({
      shopId,
      recipientEmail: settings.alertEmail,
      subject: alertSubject,
      alertType: "INCOMING_ORDER",
      content: htmlContent,
      status: "SENT",
      timestamp: new Date().toISOString(),
    });

    console.log(
      `[EMAIL ALERT DISPATCHED] Incoming order alert for ${medicineName} accepted by Brevo.` +
      ` Recipient: ${settings.alertEmail}.` +
      (brevoResult.messageId ? ` Message ID: ${brevoResult.messageId}` : "")
    );

    return {
      sent: true,
      recipient: settings.alertEmail,
      subject: alertSubject,
      messageId: brevoResult.messageId,
    };
  } catch (err) {
    console.error("[EMAIL ALERT FAILED] Unexpected error in sendIncomingOrderAlertEmail:", err);
    return { sent: false, error: String(err) };
  }
}

// ---------------------------------------------------------------------------
// Password reset email (Brevo)
// ---------------------------------------------------------------------------

/**
 * Sends an OTP password-reset email via Brevo.
 * The OTP is passed in server-side and is NEVER returned to the client.
 */
export async function sendPasswordResetEmail(params: {
  toEmail: string;
  userName: string;
  otpCode: string;
}): Promise<BrevoSendResult> {
  const { toEmail, userName, otpCode } = params;

  const subject = "🔑 MedTrack Password Reset — Your Verification Code";

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 500px; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
      <div style="background: #1E3A5F; padding: 12px 20px; border-radius: 8px; color: #ffffff;">
        <h2 style="margin: 0; font-size: 18px;">MedTrack Password Reset</h2>
      </div>
      <p style="color: #334155; font-size: 15px; margin-top: 16px;">Hello ${userName},</p>
      <p style="color: #334155; font-size: 14px;">
        A password reset was requested for your MedTrack account. Use the code below to complete the reset.
        This code expires in <strong>15 minutes</strong>.
      </p>
      <div style="text-align: center; margin: 28px 0;">
        <span style="display: inline-block; font-size: 36px; font-weight: 900; letter-spacing: 10px; color: #1E3A5F; background: #f0f9ff; border: 2px solid #bae6fd; border-radius: 12px; padding: 14px 28px; font-family: monospace;">
          ${otpCode}
        </span>
      </div>
      <p style="color: #475569; font-size: 13px;">
        If you did not request this, you can safely ignore this email. Your password will not be changed.
      </p>
      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
      <p style="font-size: 11px; color: #94a3b8; text-align: center;">
        Sent by MedTrack FEFO Pharmacy Management System &bull; ${new Date().toLocaleString()}
      </p>
    </div>
  `;

  return sendBrevoEmail({ to: toEmail, subject, htmlContent });
}
