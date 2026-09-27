import { autoClassifySchedule } from "./scheduleClassifier";

export interface KnownBarcodeItem {
  barcode: string;
  name: string;
  manufacturer: string;
  schedule: "OTC" | "H" | "H1" | "X";
  unitPrice: number;
}

// Pre-seeded database for common standard reference barcodes
const KNOWN_BARCODE_DATABASE: Record<string, KnownBarcodeItem> = {
  "8901086001234": {
    barcode: "8901086001234",
    name: "Dolo 650 (Paracetamol 650mg)",
    manufacturer: "Micro Labs Ltd",
    schedule: "OTC",
    unitPrice: 32.5,
  },
  "8901234567890": {
    barcode: "8901234567890",
    name: "Calpol 650 (Paracetamol 650mg)",
    manufacturer: "GSK India",
    schedule: "OTC",
    unitPrice: 30.0,
  },
  "8902345678901": {
    barcode: "8902345678901",
    name: "Mox 500 (Amoxicillin 500mg)",
    manufacturer: "Sun Pharma",
    schedule: "H",
    unitPrice: 85.0,
  },
  "8903456789012": {
    barcode: "8903456789012",
    name: "Okacet 10mg (Cetirizine HCI)",
    manufacturer: "Cipla Labs",
    schedule: "OTC",
    unitPrice: 24.0,
  },
  "8904567890123": {
    barcode: "8904567890123",
    name: "Glycomet 500mg (Metformin)",
    manufacturer: "USV Private Ltd",
    schedule: "H",
    unitPrice: 45.0,
  },
  "8905678901234": {
    barcode: "8905678901234",
    name: "Omez 20mg (Omeprazole)",
    manufacturer: "Dr. Reddy's Labs",
    schedule: "OTC",
    unitPrice: 62.0,
  },
  "8906789012345": {
    barcode: "8906789012345",
    name: "Alprax 0.25mg (Alprazolam)",
    manufacturer: "Torrent Pharma",
    schedule: "X",
    unitPrice: 78.0,
  },
  "8907890123456": {
    barcode: "8907890123456",
    name: "Azithral 500mg (Azithromycin)",
    manufacturer: "Alembic Pharma",
    schedule: "H1",
    unitPrice: 118.0,
  },
  "8908901234567": {
    barcode: "8908901234567",
    name: "Atorva 10mg (Atorvastatin)",
    manufacturer: "Zydus Healthcare",
    schedule: "H",
    unitPrice: 95.0,
  },
  "8909012345678": {
    barcode: "8909012345678",
    name: "Pan 40mg (Pantoprazole)",
    manufacturer: "Alkem Laboratories",
    schedule: "OTC",
    unitPrice: 54.0,
  },
  "8900123456789": {
    barcode: "8900123456789",
    name: "Brufen 400mg (Ibuprofen)",
    manufacturer: "Abbott Healthcare",
    schedule: "OTC",
    unitPrice: 28.0,
  },
};

export function lookupBarcodeDetails(barcode: string): KnownBarcodeItem | null {
  const clean = barcode.trim();
  if (KNOWN_BARCODE_DATABASE[clean]) {
    return KNOWN_BARCODE_DATABASE[clean];
  }
  // Return null for unknown barcodes so system never forces a wrong hardcoded name
  return null;
}
