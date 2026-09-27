"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { ClipboardList, Search, CheckCircle2, AlertTriangle } from "lucide-react";

export default function SalesLogPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [salesList, setSalesList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
    else if (status === "authenticated") fetchSalesLog();
  }, [status, router]);

  useEffect(() => {
    const handleRefresh = () => fetchSalesLog();
    window.addEventListener("medtrack:refresh", handleRefresh);
    return () => window.removeEventListener("medtrack:refresh", handleRefresh);
  }, []);

  const fetchSalesLog = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/sales-log");
      if (res.ok) setSalesList(await res.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const filtered = salesList.filter((s) => {
    const q = searchQuery.toLowerCase();
    if (!q) return true;
    return (
      s.medicineName?.toLowerCase().includes(q) ||
      s.patientName?.toLowerCase().includes(q) ||
      s.staffName?.toLowerCase().includes(q) ||
      s.batchDetails?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-8 pb-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#1E3A5F] tracking-tight flex items-center gap-3">
            <ClipboardList className="w-8 h-8 text-teal-600" />
            <span>Sales &amp; Dispensing Log</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 font-medium">
            Automatic record of every completed dispensing transaction.
          </p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search medicine, patient, staff…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white border border-slate-200 rounded-2xl pl-10 pr-4 py-2.5 text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-teal-600 font-medium shadow-xs"
          />
        </div>
      </div>

      {/* Table / Cards */}
      {loading ? (
        <p className="text-center py-10 text-slate-500 text-xs font-bold">Loading sales log…</p>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center space-y-3 shadow-xs">
          <CheckCircle2 className="w-10 h-10 text-teal-600 mx-auto" />
          <h3 className="text-base font-extrabold text-[#1E3A5F]">
            {searchQuery ? "No matching sales found." : "No sales recorded yet."}
          </h3>
          <p className="text-xs text-slate-500 font-medium">
            {searchQuery ? "Try a different search term." : "Sales will appear here automatically after each dispensing transaction."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-slate-500 font-medium px-1">
            Showing {filtered.length} of {salesList.length} transactions
          </p>

          {/* Desktop table */}
          <div className="hidden md:block bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-left">
                    <th className="px-4 py-3 font-extrabold text-[#1E3A5F] uppercase tracking-wider whitespace-nowrap">Date &amp; Time</th>
                    <th className="px-4 py-3 font-extrabold text-[#1E3A5F] uppercase tracking-wider">Medicine</th>
                    <th className="px-4 py-3 font-extrabold text-[#1E3A5F] uppercase tracking-wider">Batch(es)</th>
                    <th className="px-4 py-3 font-extrabold text-[#1E3A5F] uppercase tracking-wider text-center">Qty</th>
                    <th className="px-4 py-3 font-extrabold text-[#1E3A5F] uppercase tracking-wider text-right">Unit ₹</th>
                    <th className="px-4 py-3 font-extrabold text-[#1E3A5F] uppercase tracking-wider text-right">Total ₹</th>
                    <th className="px-4 py-3 font-extrabold text-[#1E3A5F] uppercase tracking-wider">Patient</th>
                    <th className="px-4 py-3 font-extrabold text-[#1E3A5F] uppercase tracking-wider">Staff</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((s) => {
                    let batches: any[] = [];
                    try { batches = JSON.parse(s.batchDetails || "[]"); } catch { /* ignore */ }
                    return (
                      <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 font-mono text-slate-600 whitespace-nowrap">
                          {new Date(s.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                          <span className="block text-[10px] text-slate-400">
                            {new Date(s.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-extrabold text-[#1E3A5F]">{s.medicineName}</td>
                        <td className="px-4 py-3 font-mono text-slate-600 text-[11px]">
                          {batches.length > 0
                            ? batches.map((b: any) => `${b.batchNumber} (−${b.deductedQuantity})`).join(", ")
                            : "—"}
                        </td>
                        <td className="px-4 py-3 text-center font-bold text-slate-800">{s.quantity}</td>
                        <td className="px-4 py-3 text-right font-medium text-slate-700">₹{Number(s.unitPrice).toFixed(2)}</td>
                        <td className="px-4 py-3 text-right font-extrabold text-teal-700">
                          ₹{Number(s.totalPrice).toFixed(2)}
                          {Number(s.discountPercent) > 0 && (
                            <span className="block text-[10px] text-amber-600 font-bold">
                              -{s.discountPercent}% off
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-600">{s.patientName || <span className="text-slate-400 italic">Walk-in</span>}</td>
                        <td className="px-4 py-3 text-slate-600">{s.staffName || "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {filtered.map((s) => {
              let batches: any[] = [];
              try { batches = JSON.parse(s.batchDetails || "[]"); } catch { /* ignore */ }
              return (
                <div key={s.id} className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3 shadow-xs text-xs">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-extrabold text-[#1E3A5F] text-sm">{s.medicineName}</p>
                      <p className="text-slate-500 font-medium mt-0.5">
                        {new Date(s.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                        {" · "}
                        {new Date(s.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-base font-black text-teal-700">₹{Number(s.totalPrice).toFixed(2)}</span>
                      {Number(s.discountPercent) > 0 && (
                        <span className="block text-[10px] text-amber-600 font-bold">-{s.discountPercent}% off</span>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600 font-medium border-t border-slate-100 pt-2">
                    <div><span className="text-slate-400 font-bold uppercase tracking-wider block text-[9px]">Quantity</span>{s.quantity} units</div>
                    <div><span className="text-slate-400 font-bold uppercase tracking-wider block text-[9px]">Unit Price</span>₹{Number(s.unitPrice).toFixed(2)}</div>
                    <div><span className="text-slate-400 font-bold uppercase tracking-wider block text-[9px]">Patient</span>{s.patientName || "Walk-in"}</div>
                    <div><span className="text-slate-400 font-bold uppercase tracking-wider block text-[9px]">Staff</span>{s.staffName || "—"}</div>
                  </div>

                  {batches.length > 0 && (
                    <div className="text-[10px] font-mono text-slate-500 bg-slate-50 rounded-xl px-3 py-1.5 border border-slate-200">
                      {batches.map((b: any) => `Batch ${b.batchNumber} (−${b.deductedQuantity}u)`).join("  ·  ")}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
