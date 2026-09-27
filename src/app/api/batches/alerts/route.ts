import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { batches, medicines, wastageLogs } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";

export function classifyExpiry(dateStr: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const expDate = new Date(dateStr);
  expDate.setHours(0, 0, 0, 0);

  const diffTime = expDate.getTime() - today.getTime();
  const daysLeft = Math.round(diffTime / (1000 * 60 * 60 * 24));

  if (daysLeft < 0) {
    return {
      daysLeft,
      level: "expired",
      action: "Remove from shelf. Log wastage before deletion.",
    };
  } else if (daysLeft <= 7) {
    return {
      daysLeft,
      level: "urgent",
      action: "Do not sell. Return or dispose immediately.",
    };
  } else if (daysLeft <= 30) {
    return {
      daysLeft,
      level: "warning",
      action: "Last window to return to distributor for credit.",
    };
  } else if (daysLeft <= 60) {
    return {
      daysLeft,
      level: "notice",
      action: "Return to distributor early — most accept up to 90 days before expiry.",
    };
  } else {
    return {
      daysLeft,
      level: null, // Healthy
      action: "No action needed.",
    };
  }
}

export async function GET() {
  const session = await getAuthSession();
  const shopId = session?.user?.shopId || 1;

  try {
    const list = await db
      .select({
        id: batches.id,
        shopId: batches.shopId,
        medicineId: batches.medicineId,
        medicineName: medicines.name,
        medicineBarcode: medicines.barcode,
        medicineSchedule: medicines.schedule,
        manufacturer: medicines.manufacturer,
        batchNumber: batches.batchNumber,
        quantity: batches.quantity,
        expiryDate: batches.expiryDate,
        supplier: batches.supplier,
        costPrice: batches.costPrice,
        receivedDate: batches.receivedDate,
      })
      .from(batches)
      .innerJoin(medicines, eq(batches.medicineId, medicines.id))
      .where(eq(batches.shopId, shopId))
      .orderBy(asc(batches.expiryDate));

    const loggedWastages = await db
      .select({ batchId: wastageLogs.batchId, batchNumber: wastageLogs.batchNumber })
      .from(wastageLogs)
      .where(eq(wastageLogs.shopId, shopId));

    const loggedBatchIdSet = new Set(loggedWastages.map((w) => w.batchId).filter(Boolean));
    const loggedBatchNumSet = new Set(loggedWastages.map((w) => w.batchNumber).filter(Boolean));

    const alertItems = list.map((batch) => {
      const alertInfo = classifyExpiry(batch.expiryDate);
      const isWastageLogged =
        batch.quantity === 0 ||
        loggedBatchIdSet.has(batch.id) ||
        loggedBatchNumSet.has(batch.batchNumber);

      return {
        ...batch,
        daysLeft: alertInfo.daysLeft,
        level: alertInfo.level,
        action: isWastageLogged
          ? "✓ Wastage already logged & written off from shelf stock."
          : alertInfo.action,
        isWastageLogged,
      };
    });

    return NextResponse.json(alertItems);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Alert calculation failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
