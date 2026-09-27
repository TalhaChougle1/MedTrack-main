import { db } from "@/lib/db";
import { medicines, shops } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { lookupBarcodeDetails } from "@/lib/barcodeLookup";
import { autoClassifySchedule } from "@/lib/scheduleClassifier";
import { persistCurrentDatabaseState } from "@/lib/db/storeSync";

export interface ResolvedBarcodeResult {
  found: boolean;
  source: "local_db" | "known_database" | "go_upc" | "none";
  medicine: {
    id: number;
    shopId?: number;
    barcode: string;
    name: string;
    manufacturer: string;
    schedule: string;
    unitPrice: number;
  };
  isNew: boolean;
}

export async function lookupBarcodeWithFallback(
  barcode: string,
  shopId: number = 1
): Promise<ResolvedBarcodeResult> {
  const cleanBarcode = barcode.trim();
  if (!cleanBarcode) {
    return {
      found: false,
      source: "none",
      medicine: {
        id: 0,
        barcode: "",
        name: "",
        manufacturer: "General Pharma",
        schedule: "OTC",
        unitPrice: 0,
      },
      isNew: true,
    };
  }

  // 1. Check existing medicine in local database for this shop (or overall)
  try {
    const [med] = await db
      .select()
      .from(medicines)
      .where(
        and(
          eq(medicines.shopId, shopId),
          eq(medicines.barcode, cleanBarcode)
        )
      );

    if (med) {
      return {
        found: true,
        source: "local_db",
        medicine: {
          id: med.id,
          shopId: med.shopId,
          barcode: med.barcode || cleanBarcode,
          name: med.name,
          manufacturer: med.manufacturer || "General Pharma",
          schedule: med.schedule || "OTC",
          unitPrice: med.unitPrice || 0,
        },
        isNew: false,
      };
    }
  } catch (err) {
    console.warn("Local DB lookup error in barcode lookup:", err);
  }

  // 2. Check KNOWN_BARCODE_DATABASE in src/lib/barcodeLookup.ts
  const known = lookupBarcodeDetails(cleanBarcode);
  if (known) {
    return {
      found: true,
      source: "known_database",
      medicine: {
        id: 0,
        barcode: known.barcode,
        name: known.name,
        manufacturer: known.manufacturer,
        schedule: known.schedule,
        unitPrice: known.unitPrice,
      },
      isNew: true,
    };
  }

  // 3. Fallback to Go-UPC API server-side
  const apiKey = process.env.GOUPC_API_KEY;
  if (apiKey && apiKey.trim().length > 0) {
    try {
      const response = await fetch(
        `https://go-upc.com/api/v1/code/${encodeURIComponent(cleanBarcode)}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${apiKey.trim()}`,
            Accept: "application/json",
            "User-Agent": "MedTrack/1.0",
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        const productName =
          data?.product?.name ||
          data?.product?.title ||
          data?.name ||
          data?.product_name;

        if (typeof productName === "string" && productName.trim().length > 0) {
          const cleanedName = productName.trim();
          const manufacturer =
            data?.product?.brand ||
            data?.brand ||
            data?.manufacturer ||
            data?.product?.manufacturer ||
            "General Pharma";
          const schedule = autoClassifySchedule(cleanedName);

          // Ensure shop record exists before inserting medicine
          const [existingShop] = await db
            .select()
            .from(shops)
            .where(eq(shops.id, shopId));

          if (!existingShop) {
            await db.insert(shops).values({
              id: shopId,
              name: "Apex MedTrack Pharmacy",
              address: "123 Health Ave",
              phone: "+1-800-555-MEDS",
            });
          }

          // Insert into local DB immediately to permanently cache this lookup
          const [insertedMed] = await db
            .insert(medicines)
            .values({
              shopId,
              barcode: cleanBarcode,
              name: cleanedName,
              manufacturer: String(manufacturer),
              schedule,
              unitPrice: 0,
              reorderThreshold: 10,
            })
            .returning();

          await persistCurrentDatabaseState();

          return {
            found: true,
            source: "go_upc",
            medicine: {
              id: insertedMed.id,
              shopId: insertedMed.shopId,
              barcode: insertedMed.barcode || cleanBarcode,
              name: insertedMed.name,
              manufacturer: insertedMed.manufacturer,
              schedule: insertedMed.schedule,
              unitPrice: insertedMed.unitPrice || 0,
            },
            isNew: false,
          };
        }
      }
    } catch (err) {
      // Graceful fallback on API failure or network issue - no errors thrown, no crashes
      console.warn("Go-UPC API request failed silently:", err);
    }
  }

  // 4. Default fallback: generic placeholder / manual entry
  return {
    found: false,
    source: "none",
    medicine: {
      id: 0,
      barcode: cleanBarcode,
      name: "",
      manufacturer: "General Pharma",
      schedule: "OTC",
      unitPrice: 0,
    },
    isNew: true,
  };
}
