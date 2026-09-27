"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  RefreshCw,
  PlusCircle,
  CheckCircle2,
  AlertTriangle,
  X,
} from "lucide-react";

export default function RestockPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [restockItems, setRestockItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Restock modal state
  const [restockModalOpen, setRestockModalOpen] = useState(false);
  const [selectedMed, setSelectedMed] = useState<any>(null);
  const [batchData, setBatchData] = useState({
    batchNumber: "",
    quantity: "",
    expiryDate: "",
    supplier: "",
    costPrice: "",
  });
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    } else if (status === "authenticated") {
      fetchData();
    }
  }, [status, router]);

  useEffect(() => {
    if (restockModalOpen) {
      document.body.style.overflow = "hidden";
      document.documentElement.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
      document.documentElement.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
      document.documentElement.style.overflow = "";
    };
  }, [restockModalOpen]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/restock-status");
      if (res.ok) setRestockItems(await res.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const openRestockModal = (med: any) => {
    setSelectedMed(med);
    setBatchData({ batchNumber: "", quantity: "", expiryDate: "", supplier: "", costPrice: "" });
    setErrorMsg("");
    setSuccessMsg("");
    setRestockModalOpen(true);
  };

  const handleRestock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMed) return;
    setActionLoading(true);
    setErrorMsg("");
    setSuccessMsg("");

    try {
      const res = await fetch("/api/batches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          medicineId: selectedMed.id,
          batchNumber: batchData.batchNumber,
          quantity: batchData.quantity,
          expiryDate: batchData.expiryDate,
          supplier: batchData.supplier,
          costPrice: batchData.costPrice,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data.error || "Failed to add stock.");
      } else {
        setSuccessMsg(`Restocked ${selectedMed.name} — Batch ${data.batchNumber} added (${data.quantity} units).`);
        setRestockModalOpen(false);
        fetchData();
        window.dispatchEvent(new Event("medtrack:refresh"));
      }
    } catch {
      setErrorMsg("Network error. Please try again.");
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-8 pb-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#1E3A5F] tracking-tight flex items-center gap-3">
            <RefreshCw className="w-8 h-8 text-teal-600" />
            <span>Restock Low-Stock Medicines</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 font-medium">
            Medicines currently at or below their configured reorder threshold. Add a new batch to replenish stock.
          </p>
        </div>
      </div>

      {/* Global notifications */}
      {errorMsg && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}
      {successMsg && (
        <div className="p-4 rounded-2xl bg-teal-50 border border-teal-200 text-teal-800 text-xs font-semibold flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Low-stock list */}
      <div className="bg-white border border-slate-200 rounded-3xl p-5 space-y-3 shadow-xs">
        {loading ? (
          <p className="text-xs text-slate-500 text-center py-8 font-bold">Checking stock levels...</p>
        ) : restockItems.length === 0 ? (
          <div className="py-12 text-center space-y-2">
            <CheckCircle2 className="w-10 h-10 text-teal-600 mx-auto" />
            <p className="text-sm font-bold text-[#1E3A5F]">All Stock Levels Healthy!</p>
            <p className="text-xs text-slate-500">Every registered medicine is above its reorder threshold.</p>
          </div>
        ) : (
          restockItems.map((item) => (
            <div
              key={item.id}
              className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs"
            >
              {/* Medicine info */}
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-extrabold text-[#1E3A5F] text-sm truncate">{item.name}</h3>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-100 text-rose-800 border border-rose-200 shrink-0">
                    LOW STOCK
                  </span>
                </div>
                <p className="text-slate-500 font-medium">Manufacturer: {item.manufacturer}</p>
                <div className="flex items-center gap-4 pt-1 text-[11px] font-medium">
                  <span>
                    Current Stock:{" "}
                    <strong className="text-rose-600 text-sm">{item.totalStock} units</strong>
                  </span>
                  <span>
                    Threshold:{" "}
                    <strong className="text-slate-700">{item.reorderThreshold} units</strong>
                  </span>
                </div>
              </div>

              {/* Restock button */}
              <button
                onClick={() => openRestockModal(item)}
                className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-extrabold flex items-center gap-2 shadow-sm transition-colors cursor-pointer shrink-0"
              >
                <PlusCircle className="w-4 h-4" />
                <span>Add Stock</span>
              </button>
            </div>
          ))
        )}
      </div>

      {/* Restock Modal */}
      {restockModalOpen && selectedMed && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6">
          <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-md p-4 sm:p-6 space-y-4 sm:space-y-5 shadow-2xl max-h-[90vh] overflow-y-auto">
            {/* Modal header */}
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-base font-extrabold text-[#1E3A5F]">Add Stock Batch</h3>
                <p className="text-xs text-slate-500 font-medium mt-0.5">Restocking for: <strong className="text-teal-700">{selectedMed.name}</strong></p>
              </div>
              <button
                onClick={() => setRestockModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Medicine summary */}
            <div className="p-3 rounded-2xl bg-teal-50 border border-teal-200 text-xs space-y-1 font-medium">
              <div className="flex items-center justify-between">
                <span className="font-extrabold text-[#1E3A5F]">{selectedMed.name}</span>
                <span className="text-[10px] font-extrabold px-2 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-200">
                  {selectedMed.totalStock} units remaining
                </span>
              </div>
              <p className="text-slate-600">Manufacturer: {selectedMed.manufacturer} • Threshold: {selectedMed.reorderThreshold} units</p>
            </div>

            {/* Batch form */}
            <form onSubmit={handleRestock} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Batch Number *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. BATCH-2026-01"
                    value={batchData.batchNumber}
                    onChange={(e) => setBatchData({ ...batchData, batchNumber: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:border-teal-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Quantity *</label>
                  <input
                    type="number"
                    required
                    min="1"
                    placeholder="e.g. 100"
                    value={batchData.quantity}
                    onChange={(e) => setBatchData({ ...batchData, quantity: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:border-teal-500 font-medium"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Expiry Date *</label>
                  <input
                    type="date"
                    required
                    value={batchData.expiryDate}
                    onChange={(e) => setBatchData({ ...batchData, expiryDate: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:border-teal-500 font-medium"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Cost Price / Unit (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="e.g. 12.50"
                    value={batchData.costPrice}
                    onChange={(e) => setBatchData({ ...batchData, costPrice: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:border-teal-500 font-medium"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Supplier *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Cipla Distributor"
                  value={batchData.supplier}
                  onChange={(e) => setBatchData({ ...batchData, supplier: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-slate-800 focus:outline-none focus:border-teal-500 font-medium"
                />
              </div>

              {errorMsg && (
                <p className="text-rose-600 text-[11px] font-semibold flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  {errorMsg}
                </p>
              )}

              <button
                type="submit"
                disabled={actionLoading}
                className="w-full py-3 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-bold text-xs shadow-md cursor-pointer transition-colors"
              >
                {actionLoading ? "Adding Stock…" : "Confirm Restock"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
