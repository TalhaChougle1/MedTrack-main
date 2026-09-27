"use client";

import { useEffect, useState, useRef } from "react";
import { Html5Qrcode } from "html5-qrcode";
import {
  X,
  QrCode,
  Boxes,
  Search,
  CheckCircle2,
  AlertTriangle,
  Keyboard,
  RefreshCw,
  Zap,
  PlusCircle,
  Usb,
  Printer,
  Camera,
} from "lucide-react";
import { autoClassifySchedule } from "@/lib/scheduleClassifier";
import { extractMedicineNameFromImage } from "@/lib/medicineOcr";
import { lookupBarcodeDetails } from "@/lib/barcodeLookup";

interface BarcodeScannerModalProps {
  mode: "check" | "stockIn";
  onClose: () => void;
  onSelectMode: (mode: "check" | "stockIn") => void;
}

const checkIsMobileDevice = () => {
  if (typeof window === "undefined") return false;
  const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera || "";
  const isTouchScreen = "ontouchstart" in window || navigator.maxTouchPoints > 0;
  const isMobileScreen = window.innerWidth < 768;
  const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
  return (isMobileUA || isMobileScreen) && isTouchScreen;
};

export default function BarcodeScannerModal({
  mode,
  onClose,
  onSelectMode,
}: BarcodeScannerModalProps) {
  const [isMobile, setIsMobile] = useState(false);
  // Default: camera on mobile, wired on desktop
  const [inputSource, setInputSource] = useState<"camera" | "wired" | "manual">("wired");

  useEffect(() => {
    const mobile = checkIsMobileDevice();
    setIsMobile(mobile);
    setInputSource(mobile ? "camera" : "wired");
  }, []);

  // Lock body scroll while modal is open
  useEffect(() => {
    const origBodyOverflow = document.body.style.overflow;
    const origTouch = document.body.style.touchAction;
    const origHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.body.style.touchAction = "none";
    document.documentElement.style.overflow = "hidden";

    const handlePreventScroll = (e: Event) => {
      const target = e.target as HTMLElement | null;
      if (!target?.closest(".modal-scrollable-content")) e.preventDefault();
    };
    window.addEventListener("wheel", handlePreventScroll, { passive: false });
    window.addEventListener("touchmove", handlePreventScroll, { passive: false });

    return () => {
      document.body.style.overflow = origBodyOverflow;
      document.body.style.touchAction = origTouch;
      document.documentElement.style.overflow = origHtmlOverflow;
      window.removeEventListener("wheel", handlePreventScroll);
      window.removeEventListener("touchmove", handlePreventScroll);
    };
  }, []);

  const [manualCode, setManualCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const [checkResult, setCheckResult] = useState<any>(null);
  const [checkSearchQuery, setCheckSearchQuery] = useState("");
  const [medicineDetailsModalData, setMedicineDetailsModalData] = useState<any>(null);

  const [stockInMedicine, setStockInMedicine] = useState<any>(null);
  const [batchNumber, setBatchNumber] = useState("");
  const [quantity, setQuantity] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [supplier, setSupplier] = useState("");
  const [costPrice, setCostPrice] = useState("");
  const [newMedicineName, setNewMedicineName] = useState("");
  const [newMedicineSchedule, setNewMedicineSchedule] = useState("OTC");
  const [existingMeds, setExistingMeds] = useState<any[]>([]);
  const [unbarcodedPopupCode, setUnbarcodedPopupCode] = useState<string | null>(null);
  const [lastStockedLabelInfo, setLastStockedLabelInfo] = useState<{
    barcode: string;
    medicineName: string;
    batchNumber: string;
    expiryDate: string;
  } | null>(null);

  useEffect(() => {
    fetch("/api/medicines")
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d)) setExistingMeds(d); })
      .catch(() => {});
  }, []);

  // Auto-focus text input when switching modes
  const manualInputRef = useRef<HTMLInputElement | null>(null);
  const wiredInputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (inputSource === "wired") wiredInputRef.current?.focus();
    else if (inputSource === "manual") manualInputRef.current?.focus();
  }, [inputSource]);

  // ─── Camera scanner ─────────────────────────────────────────────────────────
  const cameraScannerRef = useRef<Html5Qrcode | null>(null);
  const cameraActiveRef = useRef<boolean>(false);
  const [cameraPermissionError, setCameraPermissionError] = useState<string | null>(null);
  const [cameraState, setCameraState] = useState<"idle" | "starting" | "active" | "error">("idle");
  const [capturingPhoto, setCapturingPhoto] = useState(false);
  const [ocrProgressMsg, setOcrProgressMsg] = useState("");
  const [captureError, setCaptureError] = useState<string | null>(null);
  const nativeCameraInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const pendingCameraScanRef = useRef<{ code: string; count: number }>({ code: "", count: 0 });

  const confirmCameraScan = (rawText: string, onConfirmed: (code: string) => void) => {
    const trimmed = (rawText || "").trim();
    if (!trimmed) return;
    if (pendingCameraScanRef.current.code === trimmed) {
      pendingCameraScanRef.current.count += 1;
    } else {
      pendingCameraScanRef.current = { code: trimmed, count: 1 };
    }
    if (pendingCameraScanRef.current.count >= 2) {
      pendingCameraScanRef.current = { code: "", count: 0 };
      onConfirmed(trimmed);
    }
  };

  const stopCameraScanner = async () => {
    if (cameraScannerRef.current && cameraActiveRef.current) {
      cameraActiveRef.current = false;
      try { await cameraScannerRef.current.stop(); } catch { /* ignore */ }
      cameraScannerRef.current = null;
    }
    pendingCameraScanRef.current = { code: "", count: 0 };
  };

  const applyContinuousAutofocus = async (html5Qrcode: Html5Qrcode) => {
    try {
      const capabilities: any = html5Qrcode.getRunningTrackCapabilities?.();
      const advanced: any[] = [];
      if (capabilities?.focusMode?.includes?.("continuous")) advanced.push({ focusMode: "continuous" });
      if (capabilities?.focusDistance) advanced.push({ focusDistance: capabilities.focusDistance.min ?? 0 });
      if (advanced.length > 0) await (html5Qrcode as any).applyVideoConstraints({ advanced });
    } catch { /* unsupported */ }
  };

  const startCameraScanner = async () => {
    setCameraPermissionError(null);
    setCameraState("starting");
    try {
      await stopCameraScanner();
      const container = document.getElementById("direct-device-camera-reader");
      if (container) container.innerHTML = "";
      const html5Qrcode = new Html5Qrcode("direct-device-camera-reader");
      cameraScannerRef.current = html5Qrcode;
      const config = {
        fps: 30,
        videoConstraints: { facingMode: "environment", width: { ideal: 1920, min: 1280 }, height: { ideal: 1080, min: 720 }, focusMode: "continuous" },
        experimentalFeatures: { useBarCodeDetectorIfSupported: true },
      };
      const onScan = (scannedText: string) => {
        if (scannedText) {
          confirmCameraScan(scannedText, (code) => {
            try { navigator.vibrate(100); } catch { /* unsupported */ }
            handleBarcodeScanned(code);
          });
        }
      };
      try {
        await html5Qrcode.start({ facingMode: "environment" }, config, onScan, () => {});
      } catch {
        const cameras = await Html5Qrcode.getCameras().catch(() => []);
        if (cameras?.length) {
          const backCam = cameras.find((c) => /back|rear|environment|0/i.test(c.label));
          await html5Qrcode.start(backCam ? backCam.id : cameras[cameras.length - 1].id, config, onScan, () => {});
        } else throw new Error("No cameras found");
      }
      await applyContinuousAutofocus(html5Qrcode);
      cameraActiveRef.current = true;
      setCameraState("active");
    } catch (err: any) {
      cameraActiveRef.current = false;
      setCameraState("error");
      setCameraPermissionError("Camera access required. Tap the button below to allow camera permission.");
    }
  };

  const requestCameraPermissionAndStart = async () => {
    setCameraPermissionError(null);
    setCameraState("starting");
    try {
      if (navigator.mediaDevices?.getUserMedia) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
          stream.getTracks().forEach((t) => t.stop());
        } catch (permErr: any) {
          if (permErr?.name === "NotAllowedError" || permErr?.name === "PermissionDeniedError") {
            setCameraState("error");
            setCameraPermissionError("Camera permission denied. Please allow camera access to scan barcodes.");
            return;
          }
        }
      }
      await startCameraScanner();
    } catch (err: any) {
      setCameraState("error");
      setCameraPermissionError(err?.message || "Failed to start camera scanner.");
    }
  };

  useEffect(() => {
    if (inputSource !== "camera") stopCameraScanner();
    return () => { stopCameraScanner(); };
  }, [inputSource, mode]);

  const decodeImageFileAndHandle = async (file: File): Promise<string | null> => {
    const scratchId = "still-photo-decoder-scratch";
    let scratchEl = document.getElementById(scratchId);
    if (!scratchEl) {
      scratchEl = document.createElement("div");
      scratchEl.id = scratchId;
      scratchEl.style.display = "none";
      document.body.appendChild(scratchEl);
    }
    const decoder = new Html5Qrcode(scratchId);
    try {
      return await decoder.scanFile(file, false) || null;
    } catch { return null; }
    finally { try { await decoder.clear(); } catch { /* ignore */ } }
  };

  const handlePickedFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setCaptureError(null);
    setCapturingPhoto(true);
    setOcrProgressMsg("Scanning barcode in photo...");
    try {
      const decodedBarcode = await decodeImageFileAndHandle(file);
      if (decodedBarcode) {
        setOcrProgressMsg("");
        await handleBarcodeScanned(decodedBarcode);
      } else {
        setOcrProgressMsg("Extracting medicine name from photo...");
        const extractedName = await extractMedicineNameFromImage(file, (msg) => setOcrProgressMsg(msg));
        if (extractedName) {
          const internalBarcode = `890999${Math.floor(1000000 + Math.random() * 9000000)}`;
          const schedule = autoClassifySchedule(extractedName);
          onSelectMode("stockIn");
          setStockInMedicine({ barcode: internalBarcode, name: extractedName, schedule, isNew: true });
          setNewMedicineName(extractedName);
          setNewMedicineSchedule(schedule);
          setSuccessMsg(`✨ Auto-Extracted: "${extractedName}"! Generated code ${internalBarcode}. Enter batch details below.`);
          setTimeout(() => document.getElementById("stock-in-form-container")?.scrollIntoView({ behavior: "smooth", block: "start" }), 150);
        } else {
          setCaptureError("Couldn't read a barcode or medicine name in that photo. Try a clearer photo or enter manually.");
        }
      }
    } catch { setCaptureError("Error analysing photo — try again."); }
    finally { setCapturingPhoto(false); setOcrProgressMsg(""); }
  };

  // ─── Hardware wired scanner keystroke buffer ─────────────────────────────────
  const keystrokeBufferRef = useRef<string>("");
  const lastKeyTimeRef = useRef<number>(0);

  useEffect(() => {
    if (inputSource !== "wired") return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = (document.activeElement?.tagName || "").toLowerCase();
      const now = Date.now();
      const timeDiff = now - lastKeyTimeRef.current;
      lastKeyTimeRef.current = now;
      if (e.key === "Enter") {
        if (keystrokeBufferRef.current.length >= 3) {
          const scanned = keystrokeBufferRef.current;
          keystrokeBufferRef.current = "";
          handleBarcodeScanned(scanned);
        } else { keystrokeBufferRef.current = ""; }
        return;
      }
      if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        const isTextInput = activeTag === "input" || activeTag === "textarea";
        if (timeDiff > 80 && isTextInput && document.activeElement !== wiredInputRef.current && document.activeElement !== manualInputRef.current) {
          keystrokeBufferRef.current = e.key;
        } else {
          keystrokeBufferRef.current += e.key;
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [inputSource]);

  // ─── Audio/haptic feedback ───────────────────────────────────────────────────
  const playBeep = () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.12);
    } catch { /* unsupported */ }
  };

  // ─── GS1 / pharmaceutical barcode parser ─────────────────────────────────────
  const parsePharmaceuticalBarcode = (rawCode: string) => {
    const clean = rawCode.trim();
    if (!clean) return { barcode: "" };
    if (/^\d{8,14}$/.test(clean)) return { barcode: clean };

    let barcode = clean;
    let batchNumber: string | undefined;
    let expiryDate: string | undefined;

    if (clean.includes("(") && clean.includes(")")) {
      const gtinMatch = clean.match(/\(01\)(\d{13,14})/);
      if (gtinMatch) barcode = gtinMatch[1];
      const batchMatch = clean.match(/\(10\)([A-Za-z0-9_-]+)/);
      if (batchMatch) batchNumber = batchMatch[1];
      const expMatch = clean.match(/\(17\)(\d{6})/);
      if (expMatch) {
        const yy = expMatch[1].slice(0, 2), mm = expMatch[1].slice(2, 4), dd = expMatch[1].slice(4, 6);
        expiryDate = `${parseInt(yy) > 50 ? `19${yy}` : `20${yy}`}-${mm}-${dd}`;
      }
      return { barcode, batchNumber, expiryDate };
    }
    if (clean.startsWith("01") && clean.length >= 18) {
      const gtinMatch = clean.match(/^01(\d{14})/);
      if (gtinMatch) barcode = gtinMatch[1];
      const expMatch2 = clean.match(/17(\d{6})/);
      if (expMatch2) {
        const yy = expMatch2[1].slice(0, 2), mm = expMatch2[1].slice(2, 4), dd = expMatch2[1].slice(4, 6);
        expiryDate = `${parseInt(yy) > 50 ? `19${yy}` : `20${yy}`}-${mm}-${dd}`;
      }
      const batchMatch2 = clean.match(/10([A-Za-z0-9_-]{3,15})/);
      if (batchMatch2) batchNumber = batchMatch2[1];
      return { barcode, batchNumber, expiryDate };
    }
    return { barcode: clean };
  };

  function isValidEAN13(code: string): boolean {
    const clean = code.trim();
    if (!/^\d{13}$/.test(clean)) return true;
    const prefix3 = parseInt(clean.slice(0, 3));
    if (prefix3 >= 990 && prefix3 <= 999) return false;
    const digits = clean.split("").map(Number);
    const checkDigit = digits.pop()!;
    const sum = digits.reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 1 : 3), 0);
    return checkDigit === (10 - (sum % 10)) % 10;
  }

  const lastScannedCodeRef = useRef<string>("");

  // ─── Core barcode handler ────────────────────────────────────────────────────
  const handleBarcodeScanned = async (scannedCode: string) => {
    const rawInput = scannedCode.trim();
    if (!rawInput || loading) return;

    let targetCode = rawInput;
    let extractedNameFromPayload = "";
    if (rawInput.includes("|")) {
      const parts = rawInput.split("|");
      targetCode = parts[0].trim();
      extractedNameFromPayload = parts[1]?.trim() || "";
    }

    // Pure-text input in stockIn mode → auto-generate code for unbarcoded item
    if (mode === "stockIn" && !/^\d+$/.test(targetCode) && targetCode.length > 2 && !targetCode.includes("(") && !targetCode.startsWith("01")) {
      playBeep();
      const internalBarcode = `890999${Math.floor(1000000 + Math.random() * 9000000)}`;
      const schedule = autoClassifySchedule(targetCode);
      onSelectMode("stockIn");
      setStockInMedicine({ barcode: internalBarcode, name: targetCode, schedule, isNew: true });
      setNewMedicineName(targetCode);
      setNewMedicineSchedule(schedule);
      setSuccessMsg(`✨ Auto-Extracted: "${targetCode}"! Generated code ${internalBarcode}. Enter batch details below.`);
      setTimeout(() => document.getElementById("stock-in-form-container")?.scrollIntoView({ behavior: "smooth", block: "start" }), 150);
      return;
    }

    const parsed = parsePharmaceuticalBarcode(targetCode);
    const code = parsed.barcode || targetCode.trim();
    if (!code || loading) return;
    if (/^\d{13}$/.test(code) && !isValidEAN13(code)) return;

    if (lastScannedCodeRef.current === code && Date.now() - ((handleBarcodeScanned as any).lastTime || 0) < 2000) return;
    (handleBarcodeScanned as any).lastTime = Date.now();
    lastScannedCodeRef.current = code;

    playBeep();
    setLoading(true);
    setErrorMsg("");
    setSuccessMsg("");
    if (typeof window !== "undefined") window.dispatchEvent(new Event("medtrack:refresh"));

    try {
      if (mode === "check") {
        const res = await fetch(`/api/medicines/by-code/${encodeURIComponent(code)}`);
        const data = await res.json();
        if (!res.ok) {
          setErrorMsg(data.error || "Barcode not registered in live stock yet.");
          const notFoundObj = { notFound: true, barcode: code };
          setCheckResult(notFoundObj);
          setMedicineDetailsModalData(notFoundObj);
        } else {
          setCheckResult(data);
          setMedicineDetailsModalData(data);
        }
      } else {
        const res = await fetch(`/api/batches/by-code?barcode=${encodeURIComponent(code)}`);
        const data = await res.json();
        if (!res.ok) {
          setErrorMsg(data.error || "No medicine registered with this barcode.");
          setStockInMedicine(null);
        } else {
          const dbName = (data.medicine?.name && !data.medicine.name.includes("Medicine Item") && !data.medicine.name.includes("Pharma Item")) ? data.medicine.name : "";
          const schedule = dbName ? (data.medicine?.schedule || autoClassifySchedule(dbName)) : "OTC";
          setStockInMedicine({ ...data.medicine, name: dbName, schedule, barcode: code, isNew: data.isNew });
          setNewMedicineName(dbName);
          setNewMedicineSchedule(schedule);
          setBatchNumber("");
          if (parsed.expiryDate) setExpiryDate(parsed.expiryDate);
          setSuccessMsg(dbName
            ? `✨ Barcode ${code} — "${dbName}". Enter batch details below.`
            : `✨ Barcode ${code} scanned! Enter medicine name & batch details below.`);
          setTimeout(() => document.getElementById("stock-in-form-container")?.scrollIntoView({ behavior: "smooth", block: "start" }), 150);
        }
      }
    } catch { setErrorMsg("Network or lookup error occurred."); }
    finally { setLoading(false); }
  };

  // ─── Stock-in submit ─────────────────────────────────────────────────────────
  const handleStockInSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stockInMedicine || !batchNumber || !quantity || !expiryDate || !supplier) {
      setErrorMsg("Please fill in all required fields.");
      return;
    }
    if (stockInMedicine.isNew && !newMedicineName.trim()) {
      setErrorMsg("Please enter a medicine name.");
      return;
    }
    setLoading(true);
    setErrorMsg("");
    setSuccessMsg("");
    try {
      const res = await fetch("/api/batches/by-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          barcode: stockInMedicine.barcode,
          medicineName: stockInMedicine.isNew ? newMedicineName.trim() : stockInMedicine.name,
          schedule: stockInMedicine.isNew ? newMedicineSchedule : stockInMedicine.schedule,
          batchNumber,
          quantity: parseInt(quantity),
          expiryDate,
          supplier,
          costPrice: parseFloat(costPrice) || 0,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || "Failed to stock in batch.");
      } else {
        setSuccessMsg(`Successfully stocked in Batch ${data.batch.batchNumber} for ${data.medicine.name}!`);
        setLastStockedLabelInfo({ barcode: data.medicine.barcode, medicineName: data.medicine.name, batchNumber: data.batch.batchNumber, expiryDate: data.batch.expiryDate });
        setStockInMedicine(null);
        setNewMedicineName(""); setBatchNumber(""); setQuantity(""); setExpiryDate(""); setSupplier(""); setCostPrice("");
        if (typeof window !== "undefined") window.dispatchEvent(new Event("medtrack:refresh"));
      }
    } catch { setErrorMsg("Failed to submit stock in entry."); }
    finally { setLoading(false); }
  };

  // ─── Auto-generate code for unbarcoded item ──────────────────────────────────
  const handleGenerateInternalBarcode = () => {
    const internalBarcode = `890999${Math.floor(1000000 + Math.random() * 9000000)}`;
    onSelectMode("stockIn");
    setUnbarcodedPopupCode(internalBarcode);
    setStockInMedicine({ id: 0, barcode: internalBarcode, name: "", schedule: "OTC", isNew: true });
    setNewMedicineName("");
    setNewMedicineSchedule("OTC");
    setBatchNumber("");
    setSuccessMsg(`✨ Generated Internal Barcode: ${internalBarcode}. Enter medicine name & batch details below.`);
    setTimeout(() => {
      document.getElementById("stock-in-form-container")?.scrollIntoView({ behavior: "smooth", block: "start" });
      (document.getElementById("manual-medicine-name-input") as HTMLInputElement)?.focus();
    }, 150);
  };

  // ─── Label print ─────────────────────────────────────────────────────────────
  const handlePrintLabel = (labelData: { barcode: string; medicineName: string; batchNumber: string; expiryDate: string }) => {
    const w = window.open("", "_blank", "width=400,height=300");
    if (!w) return;
    w.document.write(`<html><head><title>Print Label - ${labelData.medicineName}</title><style>body{font-family:monospace,sans-serif;text-align:center;padding:20px}.label{border:2px dashed #000;padding:15px;border-radius:12px;max-width:320px;margin:auto}.title{font-weight:bold;font-size:16px;margin-bottom:4px;font-family:sans-serif}.meta{font-size:12px;color:#444;font-family:sans-serif}.barcode-box{background:#f4f4f4;padding:10px;border-radius:8px;margin:10px 0;border:1px solid #ccc}.barcode-text{font-size:18px;letter-spacing:3px;font-weight:bold;margin-top:4px}</style></head><body><div class="label"><div class="title">${labelData.medicineName}</div><div class="meta">Batch: <strong>${labelData.batchNumber}</strong> | Exp: <strong>${labelData.expiryDate}</strong></div><div class="barcode-box"><div style="font-size:24px;">||| | || |||| | ||| ||</div><div class="barcode-text">${labelData.barcode}</div></div><div class="meta">MedTrack Internal Pharmacy Barcode</div></div><script>window.onload=function(){window.print();window.close();}<\/script></body></html>`);
    w.document.close();
  };

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Medicine Details Popup (Check mode) */}
      {medicineDetailsModalData && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[100] flex items-center justify-center p-1.5 sm:p-4 max-h-[100dvh] overflow-hidden">
          <div className="bg-white rounded-2xl sm:rounded-3xl border border-slate-200 max-w-lg w-full p-4 sm:p-6 shadow-2xl space-y-4 sm:space-y-5 max-h-[calc(100dvh-0.75rem)] sm:max-h-[90vh] overflow-y-auto min-w-0">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <Boxes className="w-6 h-6 text-teal-600" />
                <h3 className="font-extrabold text-lg text-slate-900">Medicine Stock &amp; Details</h3>
              </div>
              <button type="button" onClick={() => setMedicineDetailsModalData(null)} className="p-1.5 rounded-full hover:bg-slate-100 text-slate-500 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            {medicineDetailsModalData.notFound ? (
              <div className="p-5 rounded-2xl bg-rose-50 border border-rose-200 space-y-4 text-center">
                <span className="px-3 py-1 rounded-full bg-rose-100 border border-rose-300 text-rose-800 text-xs font-black uppercase">🔴 NOT IN INVENTORY</span>
                <div>
                  <h4 className="text-base font-black text-rose-900">Barcode {medicineDetailsModalData.barcode} Not Found</h4>
                  <p className="text-xs text-rose-700 font-medium mt-1">This barcode is not registered in your shop inventory yet.</p>
                </div>
                <button type="button"
                  onClick={() => { const code = medicineDetailsModalData.barcode; setMedicineDetailsModalData(null); onSelectMode("stockIn"); handleBarcodeScanned(code); }}
                  className="w-full py-3 bg-teal-700 hover:bg-teal-800 text-white rounded-2xl font-extrabold text-xs flex items-center justify-center gap-2 cursor-pointer shadow-md"
                >
                  <PlusCircle className="w-4 h-4" />Stock In This Item Now
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className={`p-4 rounded-2xl border space-y-2 ${medicineDetailsModalData.totalStock > 0 ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200"}`}>
                  <div className="flex items-center justify-between">
                    <span className={`px-3 py-1 rounded-full text-xs font-black uppercase flex items-center gap-1.5 ${medicineDetailsModalData.totalStock > 0 ? "bg-emerald-200 text-emerald-900 border border-emerald-300" : "bg-amber-200 text-amber-900 border border-amber-300"}`}>
                      <span className={`w-2 h-2 rounded-full ${medicineDetailsModalData.totalStock > 0 ? "bg-emerald-600 animate-ping" : "bg-amber-600"}`} />
                      {medicineDetailsModalData.totalStock > 0 ? "🟢 IN STOCK" : "🟠 OUT OF STOCK"}
                    </span>
                    <div className="text-right">
                      <span className="text-3xl font-black text-slate-900">{medicineDetailsModalData.totalStock}</span>
                      <span className="block text-[10px] text-slate-500 uppercase font-extrabold">Units Left</span>
                    </div>
                  </div>
                  <div className="pt-2 border-t border-slate-200/80">
                    <h4 className="text-lg font-black text-slate-900">{medicineDetailsModalData.medicine.name}</h4>
                    <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 font-semibold mt-2">
                      <div>Barcode: <strong className="font-mono text-slate-900">{medicineDetailsModalData.medicine.barcode}</strong></div>
                      <div>Manufacturer: <strong>{medicineDetailsModalData.medicine.manufacturer}</strong></div>
                      <div>Schedule: <strong>Schedule {medicineDetailsModalData.medicine.schedule}</strong></div>
                      <div>Unit Price: <strong>₹{medicineDetailsModalData.medicine.unitPrice}</strong></div>
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <h5 className="text-xs font-black text-slate-800 uppercase tracking-wider">Active Batches ({medicineDetailsModalData.batches.length})</h5>
                  {medicineDetailsModalData.batches.length === 0 ? (
                    <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-center text-xs text-slate-500 italic">No active batches.</div>
                  ) : (
                    <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                      {medicineDetailsModalData.batches.map((b: any) => {
                        const isExp = new Date(b.expiryDate) < new Date();
                        const daysLeft = Math.ceil((new Date(b.expiryDate).getTime() - Date.now()) / 86400000);
                        const soon = !isExp && daysLeft <= 30;
                        return (
                          <div key={b.id} className={`p-3.5 rounded-2xl border flex items-center justify-between text-xs ${isExp ? "bg-rose-50 border-rose-300" : soon ? "bg-amber-50 border-amber-300" : "bg-slate-50 border-slate-200"}`}>
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-black text-slate-900">Batch #{b.batchNumber}</span>
                                <span className="text-slate-500 text-[11px]">• {b.supplier}</span>
                              </div>
                              <span className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold ${isExp ? "bg-rose-200 text-rose-900 border border-rose-400" : soon ? "bg-amber-200 text-amber-900 border border-amber-400" : "bg-emerald-100 text-emerald-800 border border-emerald-300"}`}>
                                {isExp ? "⚠️ EXPIRED" : soon ? `⏳ SOON (${daysLeft}d)` : "✅ VALID"} — Exp {b.expiryDate}
                              </span>
                            </div>
                            <div className="text-right">
                              <span className="text-base font-black text-slate-900">{b.quantity} units</span>
                              <span className="block text-[10px] text-slate-500">₹{b.costPrice}/unit</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                <div className="pt-2 border-t border-slate-200 flex gap-2">
                  <button type="button" onClick={() => setMedicineDetailsModalData(null)} className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-2xl font-bold text-xs cursor-pointer">Close</button>
                  <button type="button"
                    onClick={() => { const code = medicineDetailsModalData.medicine?.barcode || medicineDetailsModalData.barcode; setMedicineDetailsModalData(null); onSelectMode("stockIn"); handleBarcodeScanned(code); }}
                    className="flex-1 py-3 bg-teal-600 hover:bg-teal-500 text-white rounded-2xl font-extrabold text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-md"
                  >
                    <PlusCircle className="w-4 h-4" />Stock In More
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main Scanner Modal */}
      <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-1.5 sm:p-4 max-h-[100dvh] overflow-hidden">
        <div className="bg-white border-0 sm:border border-slate-200 text-slate-800 rounded-2xl sm:rounded-3xl w-full h-[calc(100dvh-0.75rem)] sm:h-auto sm:max-h-[92vh] sm:max-w-xl shadow-2xl overflow-hidden flex flex-col my-auto min-w-0">

          {/* Header */}
          <div className="flex items-center justify-between px-3 sm:px-6 py-3 sm:py-4 border-b border-slate-200 bg-slate-50 shrink-0 min-w-0">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0 overflow-hidden">
              <div className={`p-2 sm:p-2.5 rounded-xl shrink-0 ${mode === "check" ? "bg-[#1E3A5F] text-teal-400" : "bg-teal-700 text-white"}`}>
                {mode === "check" ? <QrCode className="w-5 h-5" /> : <Boxes className="w-5 h-5" />}
              </div>
              <div className="min-w-0">
                <h3 className="text-sm sm:text-lg font-extrabold text-[#1E3A5F] truncate">
                  {mode === "check" ? "Check Stock Availability" : "Stock In New Delivery"}
                </h3>
                <p className="text-[10px] sm:text-xs text-slate-500 font-medium truncate">
                  {mode === "check" ? "Scan barcode to view live stock & expiry" : "Scan barcode to auto-fill medicine & stock in"}
                </p>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 sm:p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 cursor-pointer shrink-0 ml-1">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Mode Switcher */}
          <div className="grid grid-cols-2 p-2 gap-2 bg-slate-100 border-b border-slate-200 shrink-0">
            <button
              onClick={() => { setCheckResult(null); setStockInMedicine(null); setErrorMsg(""); onSelectMode("check"); }}
              className={`py-2.5 px-4 rounded-xl text-xs font-bold transition-all cursor-pointer ${mode === "check" ? "bg-[#1E3A5F] text-white shadow-xs" : "text-slate-600 hover:bg-slate-200"}`}
            >
              Mode 1: Check Availability
            </button>
            <button
              onClick={() => { setCheckResult(null); setStockInMedicine(null); setErrorMsg(""); onSelectMode("stockIn"); }}
              className={`py-2.5 px-4 rounded-xl text-xs font-bold transition-all cursor-pointer ${mode === "stockIn" ? "bg-teal-700 text-white shadow-xs" : "text-slate-600 hover:bg-slate-200"}`}
            >
              Mode 2: Stock In Batch
            </button>
          </div>

          <div className="p-4 sm:p-6 space-y-5 overflow-y-auto flex-1 modal-scrollable-content">

            {/* ── Input Source Selector ── */}
            <div className="space-y-2">
              <label className="text-xs font-extrabold text-[#1E3A5F] uppercase tracking-wider block">Choose Scanner Input:</label>
              <div className="flex gap-2 bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
                {isMobile ? (
                  <>
                    <button type="button" onClick={() => setInputSource("camera")}
                      className={`flex-1 py-2 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${inputSource === "camera" ? "bg-white text-emerald-700 shadow-xs border border-slate-200 font-extrabold" : "text-slate-600 hover:bg-white/60"}`}>
                      <Camera className="w-3.5 h-3.5 text-emerald-600" />📷 Camera
                    </button>
                    <button type="button" onClick={() => setInputSource("wired")}
                      className={`flex-1 py-2 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${inputSource === "wired" ? "bg-white text-[#1E3A5F] shadow-xs border border-slate-200 font-extrabold" : "text-slate-600 hover:bg-white/60"}`}>
                      <Usb className="w-3.5 h-3.5 text-blue-600" />🔌 Wired
                    </button>
                    <button type="button" onClick={() => setInputSource("manual")}
                      className={`flex-1 py-2 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${inputSource === "manual" ? "bg-white text-slate-800 shadow-xs border border-slate-200 font-extrabold" : "text-slate-600 hover:bg-white/60"}`}>
                      <Keyboard className="w-3.5 h-3.5 text-slate-500" />⌨️ Manual
                    </button>
                  </>
                ) : (
                  <>
                    <button type="button" onClick={() => setInputSource("wired")}
                      className={`flex-1 py-2 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${inputSource === "wired" ? "bg-white text-[#1E3A5F] shadow-xs border border-slate-200 font-extrabold" : "text-slate-600 hover:bg-white/60"}`}>
                      <Usb className="w-3.5 h-3.5 text-blue-600" />🔌 Wired USB
                    </button>
                    <button type="button" onClick={() => setInputSource("camera")}
                      className={`flex-1 py-2 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${inputSource === "camera" ? "bg-white text-emerald-700 shadow-xs border border-slate-200 font-extrabold" : "text-slate-600 hover:bg-white/60"}`}>
                      <Camera className="w-3.5 h-3.5 text-emerald-600" />📷 Camera
                    </button>
                    <button type="button" onClick={() => setInputSource("manual")}
                      className={`flex-1 py-2 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${inputSource === "manual" ? "bg-white text-slate-800 shadow-xs border border-slate-200 font-extrabold" : "text-slate-600 hover:bg-white/60"}`}>
                      <Keyboard className="w-3.5 h-3.5 text-slate-500" />⌨️ Manual
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* ── Camera Panel ── */}
            {inputSource === "camera" && (
              <div className="p-4 sm:p-5 rounded-2xl sm:rounded-3xl bg-[#0F172A] border border-slate-800 text-white space-y-4 shadow-2xl">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                    <span className="text-xs font-bold text-emerald-400">Photo &amp; Barcode Scanner</span>
                  </div>
                  <span className="text-[10px] text-slate-400">Reads Barcodes &amp; Medicine Names</span>
                </div>
                <div className="w-full grid grid-cols-2 gap-3">
                  <input ref={nativeCameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePickedFile} />
                  <input ref={galleryInputRef} type="file" accept="image/*" className="hidden" onChange={handlePickedFile} />
                  <button type="button" onClick={() => nativeCameraInputRef.current?.click()} disabled={capturingPhoto}
                    className="py-3.5 px-4 bg-emerald-600 hover:bg-emerald-500 border border-emerald-500/50 text-white text-xs font-extrabold rounded-2xl cursor-pointer flex flex-col items-center justify-center gap-1.5 active:scale-95 transition-all disabled:opacity-60 shadow-lg">
                    <Camera className="w-5 h-5" />Phone Camera
                  </button>
                  <button type="button" onClick={() => galleryInputRef.current?.click()} disabled={capturingPhoto}
                    className="py-3.5 px-4 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-extrabold rounded-2xl cursor-pointer flex flex-col items-center justify-center gap-1.5 active:scale-95 transition-all disabled:opacity-60 shadow-lg">
                    <QrCode className="w-5 h-5 text-emerald-400" />Gallery
                  </button>
                </div>
                {ocrProgressMsg && (
                  <div className="p-3 rounded-xl bg-emerald-950/80 border border-emerald-700/60 text-emerald-300 text-xs font-semibold text-center flex items-center justify-center gap-2 animate-pulse">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-400" />{ocrProgressMsg}
                  </div>
                )}
                {captureError && <p className="text-[11px] text-rose-400 font-medium text-center">{captureError}</p>}
              </div>
            )}

            {/* ── Wired USB Panel ── */}
            {inputSource === "wired" && (
              <div className="p-5 rounded-2xl bg-blue-50/50 border border-blue-100 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-blue-900">
                    <Usb className="w-5 h-5 text-blue-600" />
                    <h4 className="font-extrabold text-sm">Wired USB Scanner Mode</h4>
                  </div>
                  <span className="px-2.5 py-1 rounded-full bg-blue-100 text-blue-800 text-[10px] font-extrabold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-ping" />🟢 Active
                  </span>
                </div>
                <p className="text-xs text-slate-600 font-medium">Plug your wired USB barcode gun into your computer. Point at any pharmaceutical barcode and scan.</p>
                <div className="flex gap-2">
                  <input ref={wiredInputRef} type="text" placeholder="Scan wired USB barcode here..." value={manualCode}
                    onChange={(e) => setManualCode(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleBarcodeScanned(manualCode); } }}
                    className="flex-1 bg-white border border-blue-200 rounded-xl px-4 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono font-medium shadow-2xs"
                  />
                  <button onClick={() => handleBarcodeScanned(manualCode)} disabled={loading || !manualCode.trim()}
                    className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-1.5 disabled:opacity-50 cursor-pointer shadow-2xs">
                    <Search className="w-4 h-4" />Scan
                  </button>
                </div>
              </div>
            )}

            {/* ── Manual Panel ── */}
            {inputSource === "manual" && (
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
                  <span>Type or Paste Barcode Manually</span>
                  <span className="text-[10px] text-slate-500 font-normal">Press Enter or Click Search</span>
                </label>
                <div className="flex gap-2">
                  <input ref={manualInputRef} type="text" placeholder="Enter barcode e.g. 8901296060667" value={manualCode}
                    onChange={(e) => setManualCode(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleBarcodeScanned(manualCode); } }}
                    className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-800 focus:outline-none focus:border-teal-600 focus:bg-white font-medium"
                  />
                  <button onClick={() => handleBarcodeScanned(manualCode)} disabled={loading || !manualCode.trim()}
                    className="px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs flex items-center gap-1.5 disabled:opacity-50 cursor-pointer">
                    <Search className="w-4 h-4" />Search
                  </button>
                </div>
              </div>
            )}

            {/* ── Quick Demo Scan Buttons ── */}
            <div className="pt-3 border-t border-slate-200 space-y-2">
              <span className="text-[11px] font-extrabold text-[#1E3A5F] flex items-center gap-1.5 uppercase tracking-wider">
                <Zap className="w-3.5 h-3.5 text-amber-500" />Quick Test Barcodes (1-Tap):
              </span>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => handleBarcodeScanned("8901296060667")}
                  className="px-3.5 py-2 rounded-xl bg-teal-50 hover:bg-teal-100 border border-teal-200 text-teal-800 text-xs font-extrabold flex items-center gap-1.5 cursor-pointer shadow-2xs">
                  <Zap className="w-3.5 h-3.5 text-amber-500 fill-amber-400" />Ozenoxacin Lotion (8901296060667)
                </button>
                <button type="button" onClick={() => handleBarcodeScanned("8901086001234")}
                  className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 text-xs font-bold flex items-center gap-1.5 cursor-pointer">
                  <Zap className="w-3.5 h-3.5 text-slate-400" />Paracetamol 650mg (8901086001234)
                </button>
                {mode === "stockIn" && (
                  <button type="button" onClick={handleGenerateInternalBarcode}
                    className="px-3.5 py-2 rounded-xl bg-purple-50 hover:bg-purple-100 border border-purple-200 text-purple-800 text-xs font-extrabold flex items-center gap-1.5 cursor-pointer shadow-2xs">
                    <PlusCircle className="w-3.5 h-3.5 text-purple-600" />✨ Unbarcoded Item? Auto-Generate Code
                  </button>
                )}
              </div>
            </div>

            {/* Unbarcoded popup */}
            {unbarcodedPopupCode && (
              <div className="p-4 sm:p-5 rounded-2xl bg-purple-950 border border-purple-600 text-white space-y-3 shadow-2xl">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-purple-300">
                    <QrCode className="w-5 h-5 text-purple-400" />
                    <h4 className="font-extrabold text-sm text-purple-200">Unbarcoded Item Code Generated!</h4>
                  </div>
                  <button type="button" onClick={() => setUnbarcodedPopupCode(null)} className="p-1 rounded-lg hover:bg-purple-800/60 text-purple-300 cursor-pointer"><X className="w-4 h-4" /></button>
                </div>
                <div className="p-3.5 bg-slate-900/90 rounded-xl border border-purple-700/60 font-mono text-center space-y-1">
                  <span className="text-[10px] text-purple-300 font-extrabold block uppercase tracking-wider">Generated Barcode</span>
                  <span className="text-2xl font-black text-amber-400 tracking-widest">{unbarcodedPopupCode}</span>
                </div>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[11px] text-purple-200 font-medium">Enter Medicine Name &amp; Batch below to save.</span>
                  <button type="button"
                    onClick={() => handlePrintLabel({ barcode: unbarcodedPopupCode, medicineName: newMedicineName || "Unbarcoded Item", batchNumber: batchNumber || "NEW", expiryDate: expiryDate || "2027-12-31" })}
                    className="px-3.5 py-1.5 bg-purple-600 hover:bg-purple-500 text-white font-extrabold text-xs rounded-xl flex items-center gap-1.5 transition-all shadow-md cursor-pointer">
                    <Printer className="w-3.5 h-3.5" />Print Label
                  </button>
                </div>
              </div>
            )}

            {/* Error / Success */}
            {errorMsg && (
              <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" /><span>{errorMsg}</span>
              </div>
            )}
            {successMsg && (
              <div className="p-4 rounded-xl bg-teal-50 border border-teal-200 text-teal-800 text-xs font-semibold space-y-3">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" /><span>{successMsg}</span>
                </div>
                {lastStockedLabelInfo && (
                  <div className="pt-2 border-t border-teal-200/60 flex items-center justify-between">
                    <span className="text-[11px] text-teal-700 font-medium">Need a barcode label for this box?</span>
                    <button type="button" onClick={() => handlePrintLabel(lastStockedLabelInfo)}
                      className="px-3 py-1.5 bg-teal-700 hover:bg-teal-800 text-white rounded-lg text-xs font-extrabold flex items-center gap-1.5 cursor-pointer">
                      <Printer className="w-3.5 h-3.5" />Print Label
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ── Check mode: search bar + results ── */}
            {mode === "check" && (
              <div className="space-y-4 pt-2 border-t border-slate-200">
                <div className="p-3.5 rounded-2xl bg-slate-100 border border-slate-200 space-y-2">
                  <label className="block text-slate-800 font-extrabold text-xs">🔍 Search Barcode or Medicine Name:</label>
                  <div className="flex gap-2">
                    <input type="text" value={checkSearchQuery}
                      onChange={(e) => setCheckSearchQuery(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (checkSearchQuery.trim()) handleBarcodeScanned(checkSearchQuery.trim()); } }}
                      placeholder="e.g. 8901296064412 or Paracetamol..."
                      className="flex-1 bg-white border border-slate-300 rounded-xl px-3.5 py-2 text-xs text-slate-900 font-mono font-bold focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                    <button type="button" onClick={() => { if (checkSearchQuery.trim()) handleBarcodeScanned(checkSearchQuery.trim()); }} disabled={loading || !checkSearchQuery.trim()}
                      className="px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white font-extrabold text-xs rounded-xl flex items-center gap-1.5 cursor-pointer shadow-md disabled:opacity-50">
                      <Search className="w-4 h-4" />Check
                    </button>
                  </div>
                </div>

                {checkResult && (
                  <div>
                    {checkResult.notFound ? (
                      <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 space-y-3 shadow-xs">
                        <h4 className="text-sm font-extrabold flex items-center gap-1.5">
                          <AlertTriangle className="w-4 h-4 text-rose-600" />Barcode {checkResult.barcode} Not Found
                        </h4>
                        <p className="text-xs text-rose-700 font-medium">Not in your live inventory yet.</p>
                        <button type="button"
                          onClick={() => { setCheckResult(null); onSelectMode("stockIn"); handleBarcodeScanned(checkResult.barcode); }}
                          className="px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-xl font-bold text-xs flex items-center gap-2 cursor-pointer shadow-sm">
                          <PlusCircle className="w-4 h-4" />Stock In This Barcode Now
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className={`p-4 rounded-2xl border space-y-2 shadow-xs ${checkResult.totalStock > 0 ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200"}`}>
                          <div className="flex items-center justify-between">
                            <span className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-wide flex items-center gap-1.5 ${checkResult.totalStock > 0 ? "bg-emerald-200 text-emerald-900 border border-emerald-300" : "bg-amber-200 text-amber-900 border border-amber-300"}`}>
                              <span className={`w-2 h-2 rounded-full ${checkResult.totalStock > 0 ? "bg-emerald-600 animate-ping" : "bg-amber-600"}`} />
                              {checkResult.totalStock > 0 ? "🟢 IN STOCK" : "🟠 OUT OF STOCK"}
                            </span>
                            <div className="text-right">
                              <span className="text-3xl font-black text-slate-900">{checkResult.totalStock}</span>
                              <span className="block text-[10px] text-slate-500 uppercase font-extrabold">Units Left</span>
                            </div>
                          </div>
                          <div className="pt-2 border-t border-slate-200/80">
                            <h4 className="text-base font-black text-slate-900">{checkResult.medicine.name}</h4>
                            <div className="flex flex-wrap gap-2 text-xs text-slate-600 font-semibold mt-1">
                              <span>Barcode: <strong className="font-mono text-slate-800">{checkResult.medicine.barcode}</strong></span>
                              <span>• Mfr: <strong>{checkResult.medicine.manufacturer}</strong></span>
                              <span>• Schedule <strong>{checkResult.medicine.schedule}</strong></span>
                            </div>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <h5 className="text-xs font-black text-slate-800 uppercase tracking-wider">Batches ({checkResult.batches.length})</h5>
                          {checkResult.batches.map((b: any) => {
                            const isExp = new Date(b.expiryDate) < new Date();
                            const daysLeft = Math.ceil((new Date(b.expiryDate).getTime() - Date.now()) / 86400000);
                            const soon = !isExp && daysLeft <= 30;
                            return (
                              <div key={b.id} className={`p-3.5 rounded-xl border flex items-center justify-between text-xs ${isExp ? "bg-rose-50/90 border-rose-300" : soon ? "bg-amber-50/90 border-amber-300" : "bg-white border-slate-200 shadow-2xs"}`}>
                                <div className="space-y-1">
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono font-black text-slate-900">#{b.batchNumber}</span>
                                    <span className="text-slate-500 text-[11px]">• {b.supplier}</span>
                                  </div>
                                  <span className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold ${isExp ? "bg-rose-200 text-rose-900 border border-rose-400" : soon ? "bg-amber-200 text-amber-900 border border-amber-400" : "bg-emerald-100 text-emerald-800 border border-emerald-300"}`}>
                                    {isExp ? "⚠️ EXPIRED" : soon ? `⏳ SOON (${daysLeft}d)` : "✅ VALID"} — Exp {b.expiryDate}
                                  </span>
                                </div>
                                <div className="text-right">
                                  <span className="text-sm font-black text-slate-900">{b.quantity} units</span>
                                  <span className="block text-[10px] text-slate-500">₹{b.costPrice}/unit</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ── Stock In mode: existing medicine selector ── */}
            {mode === "stockIn" && (
              <div id="stock-in-form-container" className="space-y-3 pt-2 border-t border-slate-200">
                {existingMeds.length > 0 && (
                  <div className="p-3 rounded-2xl bg-white border border-teal-200 space-y-1.5 text-xs shadow-2xs">
                    <label className="block text-[#1E3A5F] font-extrabold text-xs">Choose Existing Medicine (Auto-Fills Details):</label>
                    <select value={stockInMedicine?.id || ""} onChange={(e) => {
                      const found = existingMeds.find((m) => m.id.toString() === e.target.value);
                      if (found) setStockInMedicine({ id: found.id, name: found.name, manufacturer: found.manufacturer, schedule: found.schedule, barcode: found.barcode, unitPrice: found.unitPrice, isNew: false });
                    }}
                      className="w-full bg-slate-50 border border-teal-300 rounded-xl px-2.5 py-2 text-slate-800 font-bold text-xs focus:outline-none focus:ring-2 focus:ring-teal-500 cursor-pointer">
                      <option value="">-- Choose Stock Medicine to Add Batch --</option>
                      {existingMeds.map((m) => (
                        <option key={m.id} value={m.id}>{m.name} ({m.schedule}) • {m.totalStock || 0} Units</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Stock In Details Popup */}
      {stockInMedicine && (
        <div className="fixed inset-0 z-[60] bg-slate-900/70 backdrop-blur-md flex items-center justify-center p-1.5 sm:p-4 max-h-[100dvh] overflow-hidden">
          <div className="bg-white border-0 sm:border border-slate-200 rounded-2xl sm:rounded-3xl w-full h-[calc(100dvh-0.75rem)] sm:h-auto sm:max-h-[92vh] sm:max-w-lg p-3.5 sm:p-6 space-y-4 sm:space-y-5 shadow-2xl overflow-y-auto min-w-0">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-teal-50 text-teal-700 border border-teal-200"><Boxes className="w-6 h-6" /></div>
                <div>
                  <h3 className="text-base sm:text-lg font-extrabold text-[#1E3A5F]">Enter Stock Batch Details</h3>
                  <p className="text-xs text-slate-500 font-medium font-mono">Barcode: {stockInMedicine.barcode || "Manual"}</p>
                </div>
              </div>
              <button type="button" onClick={() => setStockInMedicine(null)} className="p-1 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"><X className="w-5 h-5" /></button>
            </div>

            <form onSubmit={handleStockInSubmit} className="space-y-4">
              <div className="p-3.5 rounded-2xl bg-teal-50 border border-teal-200 space-y-2 text-xs">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-teal-800 bg-teal-100 px-2 py-0.5 rounded border border-teal-200">
                  {stockInMedicine.isNew ? "✨ New Medicine Entry" : "✓ Existing Stock Medicine"}
                </span>
                <div>
                  <label className="block text-[#1E3A5F] font-extrabold text-xs mb-1">Product Barcode *</label>
                  <input type="text" value={stockInMedicine.barcode || ""}
                    onChange={(e) => setStockInMedicine({ ...stockInMedicine, barcode: e.target.value.trim() })}
                    placeholder="e.g. 8901296060667"
                    className="w-full bg-white border border-teal-300 rounded-lg px-3 py-1.5 text-slate-800 font-mono font-bold text-xs focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                {stockInMedicine.isNew ? (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div className="sm:col-span-2">
                      <label className="block text-slate-700 font-bold text-xs mb-1">Medicine Name *</label>
                      <input id="manual-medicine-name-input" type="text" value={newMedicineName}
                        onChange={(e) => { setNewMedicineName(e.target.value); setNewMedicineSchedule(autoClassifySchedule(e.target.value)); }}
                        placeholder="e.g. Paracetamol 500mg" required
                        className="w-full bg-white border border-teal-300 rounded-lg px-3 py-1.5 text-slate-800 font-bold text-xs focus:outline-none focus:ring-2 focus:ring-teal-500"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-700 font-bold text-xs mb-1">Drug Schedule</label>
                      <select value={newMedicineSchedule} onChange={(e) => setNewMedicineSchedule(e.target.value)}
                        className="w-full bg-white border border-teal-300 rounded-lg px-2 py-1.5 text-slate-800 font-bold text-xs focus:outline-none focus:ring-2 focus:ring-teal-500">
                        <option value="OTC">OTC</option>
                        <option value="H">Schedule H</option>
                        <option value="H1">Schedule H1</option>
                        <option value="X">Schedule X</option>
                      </select>
                    </div>
                  </div>
                ) : (
                  <div>
                    <p className="font-extrabold text-[#1E3A5F] text-base">{stockInMedicine.name}</p>
                    <p className="text-slate-500 text-[11px] font-medium">Manufacturer: {stockInMedicine.manufacturer} • Schedule {stockInMedicine.schedule}</p>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-slate-700 mb-1 font-bold">1. Batch Number *</label>
                  <input type="text" value={batchNumber} onChange={(e) => setBatchNumber(e.target.value)} placeholder="e.g. BATCH-001" required
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 font-mono font-bold focus:border-teal-600" />
                </div>
                <div>
                  <label className="block text-slate-700 mb-1 font-bold">2. Quantity *</label>
                  <input id="stock-in-quantity-input" type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="e.g. 50" min="1" required autoFocus
                    className="w-full bg-white border-2 border-teal-500 rounded-xl px-3 py-2 text-slate-900 focus:border-teal-600 font-extrabold shadow-xs" />
                </div>
                <div>
                  <label className="block text-slate-700 mb-1 font-bold">3. Expiry Date *</label>
                  <input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} required
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:border-teal-600 font-medium" />
                </div>
                <div>
                  <label className="block text-slate-700 mb-1 font-bold">4. Supplier *</label>
                  <input type="text" list="scanner-supplier-list" value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="e.g. Apex Pharma" required
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:border-teal-600 font-medium" />
                  <datalist id="scanner-supplier-list">
                    <option value="Sun Pharma Wholesaler" />
                    <option value="Cipla Healthcare Wholesaler" />
                    <option value="Apex Pharma Distributors" />
                    <option value="Apollo Wholesale Agency" />
                    <option value="MedPlus Regional Distribution" />
                  </datalist>
                </div>
              </div>

              <div>
                <label className="block text-slate-700 mb-1 font-bold text-xs">5. Cost Price Per Unit (₹)</label>
                <input type="number" step="0.01" value={costPrice} onChange={(e) => setCostPrice(e.target.value)} placeholder="e.g. 45.50"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 text-xs focus:border-teal-600 font-medium" />
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setStockInMedicine(null)}
                  className="w-1/3 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer">Cancel</button>
                <button type="submit" disabled={loading}
                  className="w-2/3 py-3 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md cursor-pointer disabled:opacity-50">
                  <PlusCircle className="w-4 h-4" />{loading ? "Saving..." : "Complete Stock In & Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
