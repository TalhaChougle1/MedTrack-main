"use client";

import { useState, useEffect } from "react";
import {
  X,
  ShoppingCart,
  Pill,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  ArrowLeft,
  Boxes,
  Calendar,
  Layers,
  Building2,
  DollarSign,
} from "lucide-react";

interface BatchDispenseModalProps {
  isOpen: boolean;
  medicine: any;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function BatchDispenseModal({
  isOpen,
  medicine,
  onClose,
  onSuccess,
}: BatchDispenseModalProps) {
  // Modal step: 'select-batch' | 'dispense-form' | 'receipt'
  const [step, setStep] = useState<"select-batch" | "dispense-form" | "receipt">("select-batch");

  const [batches, setBatches] = useState<any[]>([]);
  const [loadingBatches, setLoadingBatches] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState<any | null>(null); // null means Auto FEFO

  // Dispense Form state
  const [quantity, setQuantity] = useState("1");
  const [unitPrice, setUnitPrice] = useState("");
  const [discountPercent, setDiscountPercent] = useState("0");
  const [patientName, setPatientName] = useState("");
  const [doctorName, setDoctorName] = useState("");
  const [loadingSubmit, setLoadingSubmit] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [saleReceipt, setSaleReceipt] = useState<any | null>(null);

  useEffect(() => {
    if (isOpen && medicine) {
      setStep("select-batch");
      setSelectedBatch(null);
      setQuantity("1");
      setDiscountPercent("0");
      setPatientName("");
      setDoctorName("");
      setErrorMsg("");
      setSaleReceipt(null);

      // Pre-fill selling price
      const price = medicine.unitPrice > 0 ? medicine.unitPrice.toString() : "";
      setUnitPrice(price);

      fetchMedicineBatches();
    }
  }, [isOpen, medicine]);

  useEffect(() => {
    if (isOpen) {
      const origOverflow = document.body.style.overflow;
      const origTouch = document.body.style.touchAction;
      document.body.style.overflow = "hidden";
      document.body.style.touchAction = "none";
      document.documentElement.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = origOverflow;
        document.body.style.touchAction = origTouch;
        document.documentElement.style.overflow = "";
      };
    }
  }, [isOpen]);

  const fetchMedicineBatches = async () => {
    setLoadingBatches(true);
    try {
      const res = await fetch(`/api/batches`);
      if (res.ok) {
        const allBatches = await res.json();
        const filtered = allBatches.filter(
          (b: any) => b.medicineId === medicine.id && b.quantity > 0
        );
        setBatches(filtered);
      }
    } catch (err) {
      console.error("Failed to fetch batches:", err);
    } finally {
      setLoadingBatches(false);
    }
  };

  if (!isOpen || !medicine) return null;

  // Filter batches by validity
  const todayStr = new Date().toISOString().split("T")[0];
  const validBatches = batches.filter((b) => b.expiryDate >= todayStr && b.quantity > 0);
  const maxAllowedQuantity = selectedBatch
    ? selectedBatch.quantity
    : validBatches.reduce((sum, b) => sum + b.quantity, 0);

  const getDaysLeft = (expiryDateStr: string) => {
    if (!expiryDateStr) return 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const exp = new Date(expiryDateStr);
    exp.setHours(0, 0, 0, 0);
    const diffMs = exp.getTime() - today.getTime();
    return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  };

  const handleSelectBatchAndContinue = (batch: any) => {
    setSelectedBatch(batch);
    setErrorMsg("");

    // If selected specific batch has cost price and unitPrice is blank, populate
    if (batch && batch.costPrice > 0 && (!unitPrice || parseFloat(unitPrice) === 0)) {
      setUnitPrice(batch.costPrice.toString());
    }

    setStep("dispense-form");
  };

  const handleExecuteDispense = async (e: React.FormEvent) => {
    e.preventDefault();
    const reqQty = parseInt(quantity);
    if (isNaN(reqQty) || reqQty <= 0) {
      setErrorMsg("Please enter a valid positive quantity.");
      return;
    }

    if (reqQty > maxAllowedQuantity) {
      setErrorMsg(`Cannot dispense more than available stock (${maxAllowedQuantity} units).`);
      return;
    }

    const priceToSubmit = parseFloat(unitPrice) || 0;
    const discToSubmit = parseFloat(discountPercent) || 0;

    setLoadingSubmit(true);
    setErrorMsg("");

    try {
      const res = await fetch("/api/sell", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          medicineId: medicine.id,
          quantity: reqQty,
          unitPrice: priceToSubmit,
          discountPercent: discToSubmit,
          patientName: patientName.trim() || undefined,
          doctorName: doctorName.trim() || undefined,
          batchId: selectedBatch ? selectedBatch.id : undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data.error || "Dispense transaction failed.");
      } else {
        setSaleReceipt(data);
        setStep("receipt");

        // Dispatch global refresh event
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("medtrack:refresh"));
        }

        if (onSuccess) onSuccess();
      }
    } catch (err) {
      setErrorMsg("Network error connecting to dispense server.");
    } finally {
      setLoadingSubmit(false);
    }
  };

  // Live calculation metrics
  const reqQtyCalc = parseInt(quantity) || 0;
  const unitPriceCalc = parseFloat(unitPrice) || 0;
  const discPctCalc = Math.max(0, Math.min(100, parseFloat(discountPercent) || 0));
  const subtotalCalc = reqQtyCalc * unitPriceCalc;
  const discountAmountCalc = Math.round((subtotalCalc * (discPctCalc / 100)) * 100) / 100;
  const netTotalCalc = Math.max(0, Math.round((subtotalCalc - discountAmountCalc) * 100) / 100);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-1.5 sm:p-6 bg-slate-950/70 backdrop-blur-md animate-in fade-in duration-200 overscroll-none max-h-[100dvh] overflow-hidden"
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className="relative w-full max-w-2xl bg-white rounded-2xl sm:rounded-3xl shadow-2xl border border-slate-200 flex flex-col h-[calc(100dvh-0.75rem)] sm:h-auto sm:max-h-[90vh] overflow-hidden min-h-0"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="bg-[#1E3A5F] text-white px-3.5 sm:px-6 py-3 sm:py-4 flex items-center justify-between shrink-0 shadow-md min-w-0">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 pr-1 sm:pr-2">
            {step === "dispense-form" && (
              <button
                onClick={() => setStep("select-batch")}
                className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer shrink-0"
                title="Back to Batch Selection"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-teal-500/20 border border-teal-400/40 flex items-center justify-center text-teal-300 shrink-0">
              <ShoppingCart className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1 sm:gap-1.5 flex-wrap">
                <span className="px-1.5 sm:px-2 py-0.5 rounded-full text-[8px] sm:text-[10px] font-extrabold uppercase bg-teal-400/20 text-teal-300 border border-teal-400/30 whitespace-nowrap">
                  {step === "select-batch"
                    ? "Step 1: Batch Selection"
                    : step === "dispense-form"
                    ? "Step 2: Dispense Form"
                    : "Sale Completed"}
                </span>
                <span className="text-[8px] sm:text-[10px] text-slate-300 font-medium whitespace-nowrap">
                  Schedule {medicine.schedule}
                </span>
              </div>
              <h2 className="text-xs sm:text-lg font-black text-white tracking-tight truncate mt-0.5">
                {medicine.name}
              </h2>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 sm:p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer shrink-0 ml-1"
            title="Close"
          >
            <X className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-3.5 sm:p-6 overflow-y-auto space-y-4 sm:space-y-6 flex-1 min-h-0 bg-white text-slate-800">
          {/* STEP 1: BATCH SELECTION POP-UP */}
          {step === "select-batch" && (
            <div className="space-y-5 animate-in fade-in duration-150">
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-[#1E3A5F] uppercase tracking-wider">Medicine Information</p>
                  <p className="text-xs text-slate-600 font-medium mt-0.5">
                    Manufacturer: {medicine.manufacturer} • Barcode: {medicine.barcode || "N/A"}
                  </p>
                </div>
                <div className="text-right">
                  <span className={`text-2xl font-black ${medicine.totalStock > 0 ? "text-teal-700" : "text-rose-500"}`}>
                    {medicine.totalStock}
                  </span>
                  <span className="block text-[10px] text-slate-500 font-bold uppercase tracking-wider">Total Units</span>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-[#1E3A5F] uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-teal-600" />
                    <span>Select Batch to Dispense</span>
                  </h3>
                  <span className="text-[11px] text-slate-500 font-medium">
                    {validBatches.length} Valid Unexpired Batch(es) Available
                  </span>
                </div>

                {/* Batch List */}
                {loadingBatches ? (
                  <p className="text-xs text-slate-500 text-center py-6 font-medium">Loading medicine batches...</p>
                ) : batches.length === 0 ? (
                  <div className="p-6 rounded-2xl bg-amber-50 border border-amber-200 text-center space-y-2">
                    <AlertTriangle className="w-8 h-8 text-amber-600 mx-auto" />
                    <p className="text-xs font-extrabold text-amber-900">No Batches Found</p>
                    <p className="text-[11px] text-amber-800 font-medium">
                      There are no active batches logged for this medicine. Please stock in a new batch under Inventory.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2.5 max-h-[340px] overflow-y-auto pr-1">
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      Available Batches ({batches.length})
                    </p>
                    {batches.map((b) => {
                      const isExpired = b.expiryDate < todayStr;
                      const daysLeft = getDaysLeft(b.expiryDate);

                      return (
                        <div
                          key={b.id}
                          className={`p-3.5 sm:p-4 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs ${
                            isExpired
                              ? "bg-rose-50/70 border-rose-200 text-rose-900"
                              : "bg-white border-slate-200 hover:border-teal-400 hover:shadow-sm text-slate-800"
                          }`}
                        >
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono font-extrabold text-[#1E3A5F] text-sm">
                                Batch #{b.batchNumber}
                              </span>

                              {isExpired ? (
                                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-rose-600 text-white shadow-2xs">
                                  EXPIRED
                                </span>
                              ) : (
                                <span
                                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                                    daysLeft === 0
                                      ? "bg-rose-600 text-white"
                                      : daysLeft <= 7
                                      ? "bg-rose-500 text-white"
                                      : daysLeft <= 30
                                      ? "bg-amber-500 text-slate-950 font-black"
                                      : "bg-emerald-100 text-emerald-900 border border-emerald-300 font-extrabold"
                                  }`}
                                >
                                  {daysLeft === 0 ? "EXPIRES TODAY" : `${daysLeft} Days Left`}
                                </span>
                              )}

                              {!isExpired && (
                                <span className="px-2 py-0.5 rounded text-[9px] font-extrabold bg-teal-50 text-teal-800 border border-teal-200">
                                  🟢 VALID
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-600 font-medium">
                              Expiry Date: <strong className={isExpired ? "text-rose-700 font-bold" : "text-slate-800 font-bold"}>{b.expiryDate}</strong> • Supplier: {b.supplier}
                            </p>
                          </div>

                          <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 w-full sm:w-auto pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                            <div className="text-left sm:text-right">
                              <span className={`font-extrabold text-sm ${isExpired ? "text-rose-600" : "text-teal-700"}`}>
                                {b.quantity} Units
                              </span>
                              <span className="block text-[10px] text-slate-400 font-bold uppercase">
                                {b.costPrice ? `₹${b.costPrice}/cost` : "Stock"}
                              </span>
                            </div>

                            {!isExpired && b.quantity > 0 ? (
                              <button
                                onClick={() => handleSelectBatchAndContinue(b)}
                                className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-extrabold text-xs shadow-xs hover:shadow-md transition-all cursor-pointer"
                              >
                                Select
                              </button>
                            ) : (
                              <span className="px-2.5 py-1 rounded-xl bg-rose-100 text-rose-700 font-extrabold text-[10px] border border-rose-200">
                                Blocked
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STEP 2: NORMAL DISPENSE POP-UP */}
          {step === "dispense-form" && (
            <form onSubmit={handleExecuteDispense} className="space-y-6 animate-in fade-in duration-150">
              {/* Selected Target Summary Card */}
              <div className="p-4 rounded-2xl bg-teal-50 border border-teal-200 flex items-center justify-between text-xs">
                <div>
                  <span className="text-[10px] uppercase font-bold text-teal-800 tracking-wider block">
                    Selected Target Batch
                  </span>
                  <p className="font-mono font-extrabold text-[#1E3A5F] text-sm mt-0.5">
                    Batch #{selectedBatch?.batchNumber}
                  </p>
                  <p className="text-slate-600 font-medium text-[11px] mt-0.5">
                    Expiry Date: {selectedBatch?.expiryDate} ({getDaysLeft(selectedBatch?.expiryDate || "")} Days Left) • Supplier: {selectedBatch?.supplier}
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-xl font-extrabold text-teal-700">{maxAllowedQuantity}</span>
                  <span className="block text-[10px] text-slate-500 font-bold uppercase">Available Units</span>
                </div>
              </div>

              {/* Quantity, Unit Price, and Discount Percentage Inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-[#1E3A5F] uppercase tracking-wider mb-1.5">
                    1. Quantity *
                  </label>
                  <input
                    type="number"
                    min="1"
                    max={maxAllowedQuantity}
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    required
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-3 py-3 text-base font-bold text-slate-800 text-center focus:outline-none focus:border-teal-600 shadow-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#1E3A5F] uppercase tracking-wider mb-1.5">
                    2. Unit Price (₹) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={unitPrice}
                    onChange={(e) => setUnitPrice(e.target.value)}
                    placeholder="e.g. 25.00"
                    required
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-3 py-3 text-base font-bold text-slate-800 text-center focus:outline-none focus:border-teal-600 shadow-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#1E3A5F] uppercase tracking-wider mb-1.5">
                    3. Discount (%)
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="100"
                      value={discountPercent}
                      onChange={(e) => setDiscountPercent(e.target.value)}
                      placeholder="0"
                      className="w-full bg-amber-50/60 border border-amber-300 rounded-2xl px-3 py-3 text-base font-bold text-amber-900 text-center focus:outline-none focus:border-amber-500 shadow-xs"
                    />
                  </div>
                </div>
              </div>

              {/* Discount Presets */}
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <span className="text-[11px] font-bold text-slate-500 mr-1">Quick Discount:</span>
                {["0", "5", "10", "15", "20"].map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => setDiscountPercent(pct)}
                    className={`px-2.5 py-1 rounded-xl text-xs font-extrabold border transition-all cursor-pointer ${
                      discountPercent === pct
                        ? "bg-amber-500 text-slate-950 border-amber-600 shadow-xs"
                        : "bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200"
                    }`}
                  >
                    {pct}%
                  </button>
                ))}
              </div>

              {/* Optional Patient & Doctor Information */}
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-extrabold text-[#1E3A5F] uppercase tracking-wider">
                    Customer & Prescription Info
                  </span>
                  <span className="text-[10px] bg-slate-200 text-slate-700 font-bold px-2 py-0.5 rounded-full">
                    Optional Fields
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Patient's Name <span className="text-slate-400 font-normal">(Optional)</span>
                    </label>
                    <input
                      type="text"
                      value={patientName}
                      onChange={(e) => setPatientName(e.target.value)}
                      placeholder="e.g. Rahul Sharma"
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:border-teal-600 shadow-2xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Doctor's Name <span className="text-slate-400 font-normal">(Optional)</span>
                    </label>
                    <input
                      type="text"
                      value={doctorName}
                      onChange={(e) => setDoctorName(e.target.value)}
                      placeholder="e.g. Dr. A. K. Verma"
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:border-teal-600 shadow-2xs"
                    />
                  </div>
                </div>
              </div>

              {/* Total Sale Bill Amount Banner with Subtotal & Discount Breakdown */}
              <div className="p-4 rounded-2xl bg-teal-50 border border-teal-200 flex items-center justify-between shadow-xs">
                <div className="space-y-0.5">
                  <span className="text-xs text-teal-900 font-extrabold block uppercase tracking-wider">
                    Total Sale Bill Amount
                  </span>
                  <div className="text-[11px] text-slate-600 font-medium space-x-2">
                    <span>Subtotal: ₹{subtotalCalc.toFixed(2)}</span>
                    {discPctCalc > 0 && (
                      <span className="text-amber-800 font-bold">
                        • Discount ({discPctCalc}%): -₹{discountAmountCalc.toFixed(2)}
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-2xl font-black text-teal-700 font-mono">
                    ₹{netTotalCalc.toFixed(2)}
                  </span>
                  {discPctCalc > 0 && (
                    <span className="block text-[10px] text-amber-700 font-bold">
                      Saved ₹{discountAmountCalc.toFixed(2)}
                    </span>
                  )}
                </div>
              </div>

              {errorMsg && (
                <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setStep("select-batch")}
                  className="w-full sm:w-auto px-4 py-3 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold text-xs cursor-pointer border border-slate-200 order-2 sm:order-1"
                >
                  Back to Batches
                </button>

                <button
                  type="submit"
                  disabled={loadingSubmit || maxAllowedQuantity <= 0}
                  className="w-full sm:flex-1 py-3.5 rounded-2xl bg-teal-600 hover:bg-teal-700 text-white font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg transition-all transform active:scale-[0.99] disabled:opacity-50 cursor-pointer order-1 sm:order-2"
                >
                  <ShoppingCart className="w-4 h-4 text-teal-200" />
                  <span>Confirm Dispense & Log Sale</span>
                </button>
              </div>
            </form>
          )}

          {/* STEP 3: SALE RECEIPT VIEW */}
          {step === "receipt" && saleReceipt && (
            <div className="space-y-5 animate-in fade-in duration-200">
              <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-300 text-emerald-900 flex items-center gap-3">
                <CheckCircle2 className="w-7 h-7 text-emerald-600 shrink-0" />
                <div>
                  <h3 className="text-base font-extrabold text-[#1E3A5F]">Dispense & Sale Completed!</h3>
                  <p className="text-xs text-emerald-700 font-medium">
                    Stock deducted & recorded in Finance Tracker at {new Date(saleReceipt.createdAt || Date.now()).toLocaleTimeString()}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs bg-slate-50 p-4 rounded-2xl border border-slate-200 font-medium">
                <div>
                  <span className="text-slate-400 text-[10px] block font-bold uppercase">Medicine</span>
                  <span className="font-extrabold text-[#1E3A5F] text-sm">{saleReceipt.medicineName}</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block font-bold uppercase">Units Sold</span>
                  <span className="font-bold text-slate-800 text-sm">{saleReceipt.requestedQuantity} Units</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block font-bold uppercase">Discount</span>
                  <span className="font-bold text-amber-700 text-sm">
                    {saleReceipt.discountPercent || 0}% (-₹{saleReceipt.discountAmount || 0})
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block font-bold uppercase">Final Net Bill</span>
                  <span className="font-black text-emerald-700 text-base">₹{saleReceipt.totalPrice}</span>
                </div>
              </div>

              {(saleReceipt.patientName || saleReceipt.doctorName) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-cyan-50/60 p-3.5 rounded-2xl border border-cyan-200">
                  {saleReceipt.patientName && (
                    <div>
                      <span className="text-cyan-800 text-[10px] block font-bold uppercase tracking-wider">Patient Name</span>
                      <span className="font-extrabold text-slate-800 text-xs">{saleReceipt.patientName}</span>
                    </div>
                  )}
                  {saleReceipt.doctorName && (
                    <div>
                      <span className="text-cyan-800 text-[10px] block font-bold uppercase tracking-wider">Prescribing Doctor</span>
                      <span className="font-extrabold text-slate-800 text-xs">{saleReceipt.doctorName}</span>
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <p className="text-[11px] font-bold text-[#1E3A5F] uppercase tracking-wider">
                  Batches Deducted:
                </p>
                <div className="space-y-1.5">
                  {saleReceipt.deductions?.map((d: any, idx: number) => (
                    <div
                      key={idx}
                      className="p-3 rounded-xl bg-white border border-slate-200 flex items-center justify-between text-xs font-mono"
                    >
                      <span className="text-slate-700 font-semibold">
                        Batch #{d.batchNumber} (Exp: {d.expiryDate})
                      </span>
                      <span className="text-emerald-700 font-extrabold">
                        -{d.deductedQuantity} units ({d.newBatchQuantity} remaining)
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <button
                onClick={onClose}
                className="w-full py-3.5 rounded-2xl bg-[#1E3A5F] hover:bg-[#152a45] text-white font-extrabold text-xs shadow-md transition-all cursor-pointer"
              >
                Close Receipt
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
