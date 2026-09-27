/**
 * MedTrack Automatic Pharmaceutical Drug Schedule Classification Engine
 * Automatically classifies medicines into Schedule OTC, H, H1, or X based on active formulation & dosage keywords.
 */

const SCHEDULE_X_PATTERNS = [
  "ketamine",
  "amphetamine",
  "methylphenidate",
  "pentazocine",
  "secobarbital",
  "methaqualone",
  "phenobarbital",
  "schedule x",
  "sch x",
];

const SCHEDULE_H1_PATTERNS = [
  "alprazolam",
  "alprax",
  "cefixime",
  "zifi",
  "taxim-o",
  "cefpodoxime",
  "doxcef",
  "ceftriaxone",
  "monocef",
  "cefuroxime",
  "cefotaxime",
  "buprenorphine",
  "tramadol",
  "ultram",
  "zolpidem",
  "nitrazepam",
  "diazepam",
  "valium",
  "lorazepam",
  "ativan",
  "clonazepam",
  "zapiz",
  "midazolam",
  "oxazepam",
  "chlordiazepoxide",
  "codeine",
  "corex",
  "morphine",
  "fentanyl",
  "methadone",
  "pethidine",
  "rifampicin",
  "isoniazid",
  "ethambutol",
  "pyrazinamide",
  "linezolid",
  "meropenem",
  "imipenem",
  "colistin",
  "tigecycline",
  "moxifloxacin",
  "mahacef",
  "schedule h1",
  "sch h1",
];

const SCHEDULE_H_PATTERNS = [
  "amoxicillin",
  "mox",
  "ampicillin",
  "azithromycin",
  "azithral",
  "ciprofloxacin",
  "ciplox",
  "levofloxacin",
  "levo",
  "ofloxacin",
  "oflox",
  "doxycycline",
  "doxsl",
  "erythromycin",
  "clarithromycin",
  "clavulanate",
  "augmentin",
  "clavam",
  "metformin",
  "glycomet",
  "glimepiride",
  "gliclazide",
  "teneligliptin",
  "vildagliptin",
  "sitagliptin",
  "telmisartan",
  "telma",
  "amlodipine",
  "amlokind",
  "losartan",
  "ramipril",
  "enalapril",
  "atenolol",
  "metoprolol",
  "propranolol",
  "atorvastatin",
  "atorva",
  "rosuvastatin",
  "simvastatin",
  "pantoprazole",
  "pan 40",
  "pan-40",
  "pantocid",
  "pan d",
  "pan-d",
  "omeprazole",
  "omez",
  "rabeprazole",
  "esomeprazole",
  "lansoprazole",
  "domperidone",
  "ondansetron",
  "emset",
  "montelukast",
  "montek",
  "salbutamol",
  "asthalin",
  "levosalbutamol",
  "budesonide",
  "fluticasone",
  "tiotropium",
  "deflazacort",
  "prednisolone",
  "dexamethasone",
  "hydrocortisone",
  "betamethasone",
  "triamcinolone",
  "ozenoxacin",
  "thromboscar",
  "clindamycin",
  "nadifloxacin",
  "mupirocin",
  "t-bact",
  "fusidic",
  "terbinafine",
  "fluconazole",
  "zocon",
  "itraconazole",
  "canditral",
  "ketoconazole",
  "voriconazole",
  "diclofenac",
  "voveran",
  "aceclofenac",
  "zerodol",
  "injection",
  "injectable",
  "infusion",
  "schedule h",
  "sch h",
];

export function autoClassifySchedule(medicineName: string): "OTC" | "H" | "H1" | "X" {
  if (!medicineName || typeof medicineName !== "string") return "OTC";

  const lower = medicineName.toLowerCase().trim();

  // 1. Check Schedule X (Highest risk narcotic/psychotropic)
  for (const pattern of SCHEDULE_X_PATTERNS) {
    if (lower.includes(pattern)) return "X";
  }

  // 2. Check Schedule H1 (High-alert antibiotics & habit-forming drugs)
  for (const pattern of SCHEDULE_H1_PATTERNS) {
    if (lower.includes(pattern)) return "H1";
  }

  // 3. Check Schedule H (Standard prescription antibiotics & chronic disease meds)
  for (const pattern of SCHEDULE_H_PATTERNS) {
    if (lower.includes(pattern)) return "H";
  }

  // 4. Default to Over The Counter (OTC) for analgesics, vitamins, etc.
  return "OTC";
}
