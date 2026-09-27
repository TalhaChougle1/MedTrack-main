"use client";

// Load Tesseract.js dynamically from CDN if not present on window
async function ensureTesseractLoaded(): Promise<any> {
  if (typeof window === "undefined") return null;
  if ((window as any).Tesseract) return (window as any).Tesseract;

  return new Promise((resolve, reject) => {
    const existing = document.getElementById("tesseract-cdn-script");
    if (existing) {
      existing.addEventListener("load", () => resolve((window as any).Tesseract));
      existing.addEventListener("error", () => reject(new Error("Failed to load OCR library")));
      return;
    }

    const script = document.createElement("script");
    script.id = "tesseract-cdn-script";
    script.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
    script.async = true;
    script.onload = () => resolve((window as any).Tesseract);
    script.onerror = () => reject(new Error("Failed to load OCR script from CDN"));
    document.body.appendChild(script);
  });
}

// Known pharmaceutical trade names & active ingredients dictionary for instant pattern matching
const KNOWN_PHARMA_BRANDS = [
  "Ozenoxacin", "Paracetamol", "Dolo", "Calpol", "Crocin", "Amoxicillin", "Mox", "Augmentin",
  "Cetirizine", "Okacet", "Zyrtec", "Metformin", "Glycomet", "Omeprazole", "Omez", "Pantoprazole",
  "Pan", "Azithromycin", "Azithral", "Atorvastatin", "Atorva", "Ibuprofen", "Brufen", "Alprazolam",
  "Alprax", "Ciprofloxacin", "Ciplox", "Montelukast", "Telmisartan", "Amlodipine", "Ranitidine",
  "Rantac", "Diclofenac", "Voveran", "Aceclofenac", "Zerodol", "Clavulanic", "Levocetirizine",
  "Pantocid", "Cefixime", "Taxim", "Ofloxacin", "Norfloxacin", "Multivitamin", "Becosules",
  "Candid", "Clotrimazole", "Volini", "Moov", "Iodex", "Betadine", "Otrivin", "Alex", "Benadryl"
];

// Clean raw OCR text and extract exact medicine name & dosage strength
export function parseMedicineNameFromOcrText(rawText: string): string {
  if (!rawText || !rawText.trim()) return "";

  // 1. Remove common regulatory warnings & boilerplate sentences
  let cleaned = rawText
    .replace(/schedule\s+[hh1x]+\s+prescription\s+drug\s*[-:\w\s]*/gi, "")
    .replace(/warning\s*:[^\n]*/gi, "")
    .replace(/for\s+external\s+use\s+only/gi, "")
    .replace(/keep\s+out\s+of\s+reach\s+of\s+children/gi, "")
    .replace(/store\s+(below|in\s+a\s+cool)[^\n]*/gi, "")
    .replace(/each\s+(film\s+coated\s+)?(tablet|capsule|ml|gm)\s+contains[^\n]*/gi, "")
    .replace(/manufactured\s+by[^\n]*/gi, "")
    .replace(/marketed\s+by[^\n]*/gi, "")
    .replace(/mfg\.\s*lic\.\s*no[^\n]*/gi, "")
    .replace(/b\.?\s*no\.?[^\n]*/gi, "")
    .replace(/exp\.?\s*date[^\n]*/gi, "");

  const lines = cleaned
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length >= 3);

  // Check 1: Look for exact known pharma brand name matches in the lines
  for (const brand of KNOWN_PHARMA_BRANDS) {
    const matchingLine = lines.find((l) => new RegExp(`\\b${brand}\\b`, "i").test(l));
    if (matchingLine) {
      const cleanLine = sanitizeLine(matchingLine);
      if (isValidMedicineTitle(cleanLine)) return cleanLine;
    }
  }

  // Check 2: Look for line containing medicine strength (e.g. 650mg, 500 mg, 1% w/w, 10ml)
  const dosageLine = lines.find((l) =>
    /\b(\d+(\.\d+)?\s*(mg|g|mcg|ml|iu|%))\b/i.test(l) &&
    !/mrp|price|rs|batch|exp/i.test(l)
  );
  if (dosageLine) {
    const cleanLine = sanitizeLine(dosageLine);
    if (isValidMedicineTitle(cleanLine)) return cleanLine;
  }

  // Check 3: Look for line with common dosage form (Lotion, Tablet, Syrup, Ointment, Cream, Gel)
  const formLine = lines.find((l) =>
    /\b(lotion|tablet|tablets|syrup|capsule|capsules|ointment|cream|gel|drops|injection|suspension)\b/i.test(l) &&
    !/contains|dosage|warning/i.test(l)
  );
  if (formLine) {
    const cleanLine = sanitizeLine(formLine);
    if (isValidMedicineTitle(cleanLine)) return cleanLine;
  }

  // Check 4: Pick clean lines that pass strict word quality validation
  for (const line of lines) {
    const cleanLine = sanitizeLine(line);
    if (isValidMedicineTitle(cleanLine)) {
      return cleanLine;
    }
  }

  return "";
}

// Strict validation: Rejects random OCR noise like "LT J 1 LL" or single character artifacts
function isValidMedicineTitle(text: string): boolean {
  if (!text || text.length < 3) return false;

  // Must not be purely numbers or single letter noise
  if (/^[\d\s\.\-]+$/.test(text)) return false;

  // Split into words and filter out short single/double letter artifacts
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 0) return false;

  // Check if at least one word has 4+ letters OR matches a dosage form/strength
  const hasSubstantialWord = words.some(
    (w) =>
      /^[a-zA-Z]{4,}$/.test(w) ||
      /\b(mg|g|ml|iu|%|lotion|tablet|syrup|capsule|cream|gel)\b/i.test(w)
  );

  return hasSubstantialWord;
}

function sanitizeLine(text: string): string {
  return text
    .replace(/[^a-zA-Z0-9\s%\.\-\(\)]/g, "")
    .replace(/\b(rx|mfg|exp|batch|mrp|price|lic|no)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

export async function extractMedicineNameFromImage(
  file: File,
  onProgress?: (msg: string) => void
): Promise<string> {
  try {
    if (onProgress) onProgress("Loading AI OCR Engine...");
    const Tesseract = await ensureTesseractLoaded();
    if (!Tesseract) throw new Error("OCR engine unavailable");

    if (onProgress) onProgress("Extracting medicine name & strength...");

    const worker = await Tesseract.createWorker("eng");
    const { data } = await worker.recognize(file);
    await worker.terminate();

    const rawText = data.text || "";
    const extractedName = parseMedicineNameFromOcrText(rawText);

    return extractedName;
  } catch (err: any) {
    console.warn("OCR Medicine Name Extraction failed:", err);
    return "";
  }
}
