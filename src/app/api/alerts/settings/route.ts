import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { alertSettings, emailLogs } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { getShopAlertSettings } from "@/lib/emailService";
import { validateEmail } from "@/lib/emailValidation";

export async function GET() {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const shopId = session.user.shopId;

  try {
    const settings = await getShopAlertSettings(shopId);
    
    // Fetch dispatched email logs for shop
    const logs = await db
      .select()
      .from(emailLogs)
      .where(eq(emailLogs.shopId, shopId))
      .orderBy(desc(emailLogs.timestamp))
      .limit(50);

    return NextResponse.json({
      settings,
      logs,
    });
  } catch (error: unknown) {
    console.error("Fetch alert settings error:", error);
    const msg = error instanceof Error ? error.message : "Failed to fetch alert settings";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const shopId = session.user.shopId;

  try {
    const body = await req.json();
    const { alertEmail, enableLowStockEmails, enableIncomingOrderEmails } = body;

    if (alertEmail) {
      const emailVal = validateEmail(alertEmail);
      if (!emailVal.isValid) {
        return NextResponse.json(
          { error: emailVal.error || "Please enter a valid alert email address." },
          { status: 400 }
        );
      }
    }

    const cleanedEmail = alertEmail ? alertEmail.trim().toLowerCase() : "";

    // Check if settings record exists
    const existing = await db
      .select()
      .from(alertSettings)
      .where(eq(alertSettings.shopId, shopId));

    const previousEmail = existing.length > 0 ? (existing[0].alertEmail || "") : "";
    const emailChanged = cleanedEmail !== previousEmail;

    if (existing.length > 0) {
      await db
        .update(alertSettings)
        .set({
          alertEmail: cleanedEmail,
          enableLowStockEmails: Boolean(enableLowStockEmails),
          enableIncomingOrderEmails: Boolean(enableIncomingOrderEmails),
        })
        .where(eq(alertSettings.shopId, shopId));
    } else {
      await db.insert(alertSettings).values({
        shopId,
        alertEmail: cleanedEmail,
        enableLowStockEmails: Boolean(enableLowStockEmails),
        enableIncomingOrderEmails: Boolean(enableIncomingOrderEmails),
      });
    }

    // If the recipient email changed, insert a RECOVERY marker for every
    // medicine that has a pending SENT log.  This means the duplicate-
    // suppression logic will immediately allow fresh alerts to the new address
    // without requiring a manual "Reset Alert State".
    if (emailChanged && cleanedEmail) {
      try {
        // Find all distinct medicine names that have an outstanding SENT log
        const sentLogs = await db
          .select()
          .from(emailLogs)
          .where(eq(emailLogs.shopId, shopId));

        const pendingMedicines = new Set<string>();
        for (const log of sentLogs) {
          if (log.alertType === "LOW_STOCK" && log.status === "SENT") {
            // Extract medicine name from subject, e.g. "⚠️ LOW STOCK ALERT: Paracetamol"
            const match = log.subject.match(/ALERT:\s*(.+)$/);
            if (match) pendingMedicines.add(match[1].trim());
          }
        }

        // Insert a RECOVERY marker for each, so the next low-stock event
        // fires to the new recipient.
        for (const medicineName of pendingMedicines) {
          await db.insert(emailLogs).values({
            shopId,
            recipientEmail: cleanedEmail,
            subject: `✅ RECIPIENT CHANGED — reset for ${medicineName}`,
            alertType: "LOW_STOCK",
            content: `Recipient changed from "${previousEmail}" to "${cleanedEmail}".`,
            status: "RECOVERY",
            timestamp: new Date().toISOString(),
          });
        }

        if (pendingMedicines.size > 0) {
          console.log(
            `[ALERT SETTINGS] Recipient changed "${previousEmail}" → "${cleanedEmail}". ` +
            `Inserted RECOVERY markers for: ${[...pendingMedicines].join(", ")}`
          );
        }
      } catch (recoveryErr) {
        // Non-fatal — log and continue
        console.warn("[ALERT SETTINGS] Failed to insert recovery markers:", recoveryErr);
      }
    }

    console.log(
      `[ALERT SETTINGS SAVED] shopId=${shopId} ` +
      `recipient="${cleanedEmail}" ` +
      `lowStock=${Boolean(enableLowStockEmails)} ` +
      `incomingOrder=${Boolean(enableIncomingOrderEmails)}` +
      (emailChanged ? ` (changed from "${previousEmail}")` : "")
    );

    return NextResponse.json({
      success: true,
      message: "Alert notification settings saved successfully.",
    });
  } catch (error: unknown) {
    console.error("Update alert settings error:", error);
    const msg = error instanceof Error ? error.message : "Failed to update alert settings";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
