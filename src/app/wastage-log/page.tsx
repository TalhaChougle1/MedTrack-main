"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Trash2, CheckCircle2, Search } from "lucide-react";

export default function WastageLogPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [wastageList, setWastageList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
    else if (status === "authenticated") fetchWastageLogs();
  }, [status, router]);

  useEffect(() => {
    const handleRefresh = () => fetchWastageLogs();
    window.addEventListener("medtrack:refresh", handleRefresh);
    return () => window.removeEventListener("medtrack:refresh", handleRefresh);
  }, []);

  const fetchWastageLogs = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/wastage");
      if (res.ok) setWastageList(await res.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const filtered = wastageList.filter((w) => {
    const q = searchQuery.toLowerCase();
    if (!q) return true;
    return (
      w.medicineName?.toLowerCase().includes(q) ||
      w.batchNumber?.toLowerCase().includes(q) ||
      w.reason?.toLowerCase().includes(q) ||
      w.performedByName?.toLowerCase().includes(q)
    );
  });

  const reasonColour = (reason: string) => {
    switch (reason?.toLowerCase()) {
      case "expired":     return "bg-rose-100 text-rose-800 border-rose-200";
      case "damaged":     return "bg-amber-100 text-amber-800 border-amber-200";
      case "contaminated":return "bg-orange-100 text-orange-800 border-orange-200";
      case "recalled":    return "bg-purple-100 text-purple-800 border-purple-200";
      default:            return "bg-slate-100 text-slate-700 border-slate-200";
    }
  };

  return (
    <div className="space-y-8 pb-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#1E3A5F] tracking-tight flex items-center gap-3">
            <Trash2 className="w-8 h-8 text-rose-600" />
            <span>Stock Wastage &amp; Write-Off Log</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 font-medium">
            Record of all expired, damaged, or recalled medicine write-offs.
          </p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search medicine, batch, reason…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white border border-slate-200 rounded-2xl pl-10 pr-4 py-2.5 text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-rose-500 font-medium shadow-xs"
          />
        </div>
      </div>

      {/* Log list */}
      {loading ? (
        <p className="text-center py-10 text-slate-500 text-xs font-bold">Loading wastage log…</p>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center space-y-3 shadow-xs">
          <CheckCircle2 className="w-10 h-10 text-teal-600 mx-auto" />
          <h3 className="text-base font-extrabold text-[#1E3A5F]">
            {searchQuery ? "No matching wastage records found." : "No Wastage Logged!"}
          </h3>
          <p className="text-xs text-slate-500 font-medium">
            {searchQuery
              ? "Try a different search term."
              : "Wastage write-offs are recorded from the Expiry Alerts page when you log a batch for disposal."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-slate-500 font-medium px-1">
            {filtered.length} of {wastageList.length} write-off records
          </p>

          {/* Desktop table */}
          <div className="hidden md:block bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-left">
                    <th className="px-4 py-3 font-extrabold text-[#1E3A5F] uppercase tracking-wider whitespace-nowrap">Date &amp; Time</th>
                    <th className="px-4 py-3 font-extrabold text-[#1E3A5F] uppercase tracking-wider">Medicine</th>
                    <th className="px-4 py-3 font-extrabold text-[#1E3A5F] uppercase tracking-wider">Batch</th>
                    <th className="px-4 py-3 font-extrabold text-[#1E3A5F] uppercase tracking-wider text-center">Qty Written Off</th>
                    <th className="px-4 py-3 font-extrabold text-[#1E3A5F] uppercase tracking-wider">Reason</th>
                    <th className="px-4 py-3 font-extrabold text-[#1E3A5F] uppercase tracking-wider">Staff</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((w) => (
                    <tr key={w.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-mono text-slate-600 whitespace-nowrap">
                        {new Date(w.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                        <span className="block text-[10px] text-slate-400">
                          {new Date(w.date).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-extrabold text-[#1E3A5F]">{w.medicineName}</td>
                      <td className="px-4 py-3 font-mono text-slate-600">{w.batchNumber}</td>
                      <td className="px-4 py-3 text-center">
                        <span className="font-black text-rose-600 text-sm">−{w.quantity}</span>
                        <span className="block text-[10px] text-slate-400">units</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase border ${reasonColour(w.reason)}`}>
                          {w.reason}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{w.performedByName || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {filtered.map((w) => (
              <div key={w.id} className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-xs">
                <div className="space-y-1.5 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-extrabold text-[#1E3A5F] text-sm">{w.medicineName}</span>
                    <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-slate-200 text-slate-700">Batch {w.batchNumber}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase border ${reasonColour(w.reason)}`}>
                      {w.reason}
                    </span>
                  </div>
                  <p className="text-slate-500 font-medium">
                    Staff: <span className="text-slate-700 font-bold">{w.performedByName || "—"}</span>
                    {" · "}
                    {new Date(w.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                    {" "}
                    {new Date(w.date).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
                <div className="shrink-0 text-right sm:text-left">
                  <span className="text-lg font-black text-rose-600">−{w.quantity} Units</span>
                  <span className="block text-[10px] text-slate-500 font-bold">Written Off</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
