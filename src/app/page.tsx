"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Pill,
  Boxes,
  AlertTriangle,
  RefreshCw,
  ArrowRight,
  Clock,
  ShieldCheck,
  QrCode,
  CheckCircle2,
  Users,
  BarChart2,
  ShoppingCart,
  PlusCircle,
  TrendingUp,
  DollarSign,
  Receipt,
  Building2,
  Calendar,
} from "lucide-react";
import BarcodeScannerModal from "@/components/BarcodeScannerModal";

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [loading, setLoading] = useState(true);

  // High-level inventory & alert counts
  const [stats, setStats] = useState({
    totalMedicines: 0,
    totalBatches: 0,
    totalStockUnits: 0,
    expiredCount: 0,
    urgentCount: 0,
    warningCount: 0,
    noticeCount: 0,
    reorderCount: 0,
  });

  // Sales statistics from database
  const [salesStats, setSalesStats] = useState({
    today: { revenue: 0, unitsSold: 0, transactions: 0 },
    month: { revenue: 0, unitsSold: 0, transactions: 0 },
    topSelling: [] as Array<{
      rank: number;
      medicineId: number;
      medicineName: string;
      totalQuantitySold: number;
      totalRevenue: number;
      salesCount: number;
    }>,
    recentSales: [] as Array<{
      id: number;
      medicineName: string;
      quantity: number;
      totalPrice: number;
      patientName: string | null;
      createdAt: string;
    }>,
  });

  const [recentAlerts, setRecentAlerts] = useState<any[]>([]);
  const [lowStockItems, setLowStockItems] = useState<any[]>([]);

  // Barcode Scanner Modal
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerMode, setScannerMode] = useState<"check" | "stockIn">("check");

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    } else if (status === "authenticated") {
      fetchDashboardData(true);
    }
  }, [status, router]);

  useEffect(() => {
    const handleRefresh = () => fetchDashboardData();
    window.addEventListener("medtrack:refresh", handleRefresh);
    return () => window.removeEventListener("medtrack:refresh", handleRefresh);
  }, []);

  const fetchDashboardData = useCallback(async (isInitial = false) => {
    if (isInitial) setLoading(true);
    try {
      const [medRes, alertRes, restockRes, salesRes] = await Promise.all([
        fetch("/api/medicines"),
        fetch("/api/batches/alerts"),
        fetch("/api/restock-status"),
        fetch("/api/sales/stats"),
      ]);

      const meds = medRes.ok ? await medRes.json() : [];
      const alerts = alertRes.ok ? await alertRes.json() : [];
      const restocks = restockRes.ok ? await restockRes.json() : [];
      const salesData = salesRes.ok ? await salesRes.json() : null;

      const expired = Array.isArray(alerts) ? alerts.filter((a: any) => a.level === "expired") : [];
      const urgent = Array.isArray(alerts) ? alerts.filter((a: any) => a.level === "urgent") : [];
      const warning = Array.isArray(alerts) ? alerts.filter((a: any) => a.level === "warning") : [];
      const notice = Array.isArray(alerts) ? alerts.filter((a: any) => a.level === "notice") : [];
      const totalUnits = Array.isArray(meds)
        ? meds.reduce((sum: number, m: any) => sum + (Number(m.totalStock) || 0), 0)
        : 0;

      setStats({
        totalMedicines: Array.isArray(meds) ? meds.length : 0,
        totalBatches: Array.isArray(alerts) ? alerts.length : 0,
        totalStockUnits: totalUnits,
        expiredCount: expired.length,
        urgentCount: urgent.length,
        warningCount: warning.length,
        noticeCount: notice.length,
        reorderCount: Array.isArray(restocks) ? restocks.length : 0,
      });

      if (Array.isArray(alerts)) {
        setRecentAlerts(alerts.filter((a: any) => a.level !== null).slice(0, 5));
      }

      if (Array.isArray(restocks)) {
        setLowStockItems(restocks.slice(0, 5));
      }

      if (salesData) {
        setSalesStats(salesData);
      }
    } catch (err) {
      console.error("Dashboard fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  if (status === "unauthenticated") return null;

  if (status === "loading" || loading) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-[#1E3A5F] animate-spin flex items-center justify-center text-teal-400">
          <Pill className="w-6 h-6" />
        </div>
        <p className="text-sm font-bold text-[#1E3A5F]">Loading Pharmacy Overview...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-12">
      {/* ── HEADER & WELCOME BANNER ── */}
      <div className="relative rounded-3xl bg-cyan-gradient border border-cyan-300/40 p-6 sm:p-8 overflow-hidden shadow-xl text-white">
        <div className="absolute top-0 right-0 w-96 h-96 bg-white/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-xl">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-3 py-1 rounded-full text-xs font-extrabold bg-white/20 text-white border border-white/30">
                FEFO Order Active
              </span>
              <span className="text-xs text-white/90 font-medium">Shop #{session?.user?.shopId}</span>
              <span className="text-xs text-white/90 font-medium">• {new Date().toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
              Welcome back, {session?.user?.name || "Pharmacist"} 👋
            </h1>
            <p className="text-xs sm:text-sm text-white/90 font-medium">
              Apex MedTrack Pharmacy management center. Real-time batch inventory, expiry alerts, and point-of-sale dispensing.
            </p>
          </div>

          {/* Quick Primary Actions in Header */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <Link
              href="/sell"
              className="px-4 py-2.5 rounded-2xl bg-white text-[#1BA6C4] hover:bg-slate-50 font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg transition-all transform hover:scale-[1.02]"
            >
              <ShoppingCart className="w-4 h-4 text-[#1BA6C4]" />
              <span>New Sale (POS)</span>
            </Link>

            <button
              onClick={() => {
                setScannerMode("check");
                setScannerOpen(true);
              }}
              className="px-3.5 py-2.5 rounded-2xl bg-white/15 hover:bg-white/25 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 border border-white/30 transition-colors cursor-pointer backdrop-blur-sm"
            >
              <QrCode className="w-4 h-4 text-white" />
              <span>Scan Barcode</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── QUICK ACTION SHORTCUTS (Phase 4 / 13) ── */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Link
          href="/sell"
          className="p-3.5 rounded-2xl bg-teal-600 hover:bg-teal-700 text-white flex flex-col items-center justify-center text-center gap-2 shadow-sm transition-all transform hover:scale-[1.02] group"
        >
          <ShoppingCart className="w-5 h-5 text-white group-hover:scale-110 transition-transform" />
          <span className="text-xs font-black">New Sale</span>
        </Link>

        <Link
          href="/inventory"
          className="p-3.5 rounded-2xl bg-white hover:bg-slate-50 border border-slate-200 text-[#1E3A5F] flex flex-col items-center justify-center text-center gap-2 shadow-2xs transition-all transform hover:scale-[1.02] group"
        >
          <PlusCircle className="w-5 h-5 text-teal-600 group-hover:scale-110 transition-transform" />
          <span className="text-xs font-extrabold">Add Medicine</span>
        </Link>

        <button
          onClick={() => {
            setScannerMode("check");
            setScannerOpen(true);
          }}
          className="p-3.5 rounded-2xl bg-white hover:bg-slate-50 border border-slate-200 text-[#1E3A5F] flex flex-col items-center justify-center text-center gap-2 shadow-2xs transition-all transform hover:scale-[1.02] cursor-pointer group"
        >
          <QrCode className="w-5 h-5 text-[#1BA6C4] group-hover:scale-110 transition-transform" />
          <span className="text-xs font-extrabold">Scan Barcode</span>
        </button>

        <Link
          href="/restock"
          className="p-3.5 rounded-2xl bg-white hover:bg-slate-50 border border-slate-200 text-[#1E3A5F] flex flex-col items-center justify-center text-center gap-2 shadow-2xs transition-all transform hover:scale-[1.02] group"
        >
          <RefreshCw className="w-5 h-5 text-amber-600 group-hover:scale-110 transition-transform" />
          <span className="text-xs font-extrabold">Add Stock</span>
        </Link>

        <Link
          href="/inventory"
          className="p-3.5 rounded-2xl bg-white hover:bg-slate-50 border border-slate-200 text-[#1E3A5F] flex flex-col items-center justify-center text-center gap-2 shadow-2xs transition-all transform hover:scale-[1.02] group col-span-2 sm:col-span-1"
        >
          <Boxes className="w-5 h-5 text-teal-700 group-hover:scale-110 transition-transform" />
          <span className="text-xs font-extrabold">View Inventory</span>
        </Link>
      </div>

      {/* ── SUMMARY KPI CARDS (Real Database Numbers) ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        {/* Today's Sales */}
        <Link
          href="/sell"
          className="p-5 rounded-3xl bg-white border border-slate-200 shadow-xs space-y-2 hover:border-teal-400 hover:shadow-md transition-all group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Today's Sales</span>
            <div className="p-2 rounded-xl bg-teal-50 text-teal-700 group-hover:scale-105 transition-transform">
              <DollarSign className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-black text-[#1E3A5F] font-mono">
              ₹{salesStats.today.revenue.toFixed(2)}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 font-medium">
            {salesStats.today.transactions} transactions completed today
          </p>
        </Link>

        {/* Medicines Sold Today */}
        <Link
          href="/reports"
          className="p-5 rounded-3xl bg-white border border-slate-200 shadow-xs space-y-2 hover:border-teal-400 hover:shadow-md transition-all group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Medicines Sold Today</span>
            <div className="p-2 rounded-xl bg-cyan-50 text-[#1BA6C4] group-hover:scale-105 transition-transform">
              <Pill className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-black text-teal-700">
              {salesStats.today.unitsSold}
            </span>
            <span className="text-xs text-slate-400 font-bold uppercase">Units</span>
          </div>
          <p className="text-[11px] text-slate-500 font-medium">
            Month: ₹{salesStats.month.revenue.toFixed(2)} ({salesStats.month.unitsSold}u)
          </p>
        </Link>

        {/* Low Stock Medicines */}
        <Link
          href="/restock"
          className="p-5 rounded-3xl bg-white border border-amber-200 shadow-xs space-y-2 hover:border-amber-400 hover:shadow-md transition-all group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-800 uppercase tracking-wider">Low Stock Medicines</span>
            <div className="p-2 rounded-xl bg-amber-50 text-amber-600 group-hover:scale-105 transition-transform">
              <RefreshCw className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-black text-amber-700">
              {stats.reorderCount}
            </span>
            <span className="text-xs text-amber-800 font-bold uppercase">Medicines</span>
          </div>
          <p className="text-[11px] text-amber-700 font-semibold flex items-center gap-1">
            <span>At or below threshold</span>
            <ArrowRight className="w-3 h-3" />
          </p>
        </Link>

        {/* Expiring Soon / Expired */}
        <Link
          href="/alerts"
          className="p-5 rounded-3xl bg-white border border-rose-200 shadow-xs space-y-2 hover:border-rose-400 hover:shadow-md transition-all group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-rose-700 uppercase tracking-wider">Expiring / Expired</span>
            <div className="p-2 rounded-xl bg-rose-50 text-rose-600 group-hover:scale-105 transition-transform">
              <AlertTriangle className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-black text-rose-600">
              {stats.expiredCount + stats.urgentCount}
            </span>
            <span className="text-xs text-rose-700 font-bold uppercase">Batches</span>
          </div>
          <p className="text-[11px] text-rose-700 font-semibold flex items-center gap-1">
            <span>{stats.expiredCount} expired, {stats.urgentCount} urgent</span>
            <ArrowRight className="w-3 h-3" />
          </p>
        </Link>
      </div>

      {/* ── 2-COLUMN MAIN PHARMACY OVERVIEW ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* LEFT COLUMN: LOW STOCK & EXPIRY ALERTS (7 Cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Low Stock Urgent Watch */}
          <div className="bg-white rounded-3xl border border-slate-200 p-5 space-y-3 shadow-xs">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-amber-600" />
                <h3 className="text-sm font-extrabold text-[#1E3A5F] uppercase tracking-wider">
                  Low Stock Medicines Requiring Reorder
                </h3>
              </div>
              <Link href="/restock" className="text-xs font-bold text-teal-700 hover:underline flex items-center gap-1">
                <span>View All ({stats.reorderCount})</span>
                <ArrowRight className="w-3 h-3" />
              </Link>
            </div>

            {lowStockItems.length === 0 ? (
              <div className="py-8 text-center space-y-1.5">
                <CheckCircle2 className="w-7 h-7 text-teal-600 mx-auto" />
                <p className="text-xs font-bold text-[#1E3A5F]">All Stock Quantities Healthy</p>
                <p className="text-[11px] text-slate-400">No medicines are currently at or below minimum threshold.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {lowStockItems.map((item) => (
                  <div key={item.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                    <div className="space-y-0.5 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-[#1E3A5F] truncate">{item.name}</span>
                        <span className="px-1.5 py-0.2 rounded text-[9px] font-extrabold bg-rose-100 text-rose-800 border border-rose-200">
                          LOW
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 font-medium">
                        Current: <strong className="text-rose-600">{item.totalStock} units</strong> • Threshold: {item.reorderThreshold} units
                      </p>
                    </div>

                    <Link
                      href="/restock"
                      className="px-3 py-1.5 rounded-xl bg-teal-50 hover:bg-teal-100 text-teal-800 text-xs font-bold border border-teal-200 transition-colors shrink-0"
                    >
                      Restock
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Expiry Alerts Watch */}
          <div className="bg-white rounded-3xl border border-slate-200 p-5 space-y-3 shadow-xs">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-rose-600" />
                <h3 className="text-sm font-extrabold text-[#1E3A5F] uppercase tracking-wider">
                  Critical Expiry Watch (Next 30 Days)
                </h3>
              </div>
              <Link href="/alerts" className="text-xs font-bold text-teal-700 hover:underline flex items-center gap-1">
                <span>View All Alerts</span>
                <ArrowRight className="w-3 h-3" />
              </Link>
            </div>

            {recentAlerts.length === 0 ? (
              <div className="py-8 text-center space-y-1.5">
                <CheckCircle2 className="w-7 h-7 text-teal-600 mx-auto" />
                <p className="text-xs font-bold text-[#1E3A5F]">No Expiry Alerts Detected</p>
                <p className="text-[11px] text-slate-400">All unexpired batches have more than 30 days remaining.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {recentAlerts.map((alert, idx) => (
                  <div key={idx} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                    <div className="space-y-0.5 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-extrabold text-[#1E3A5F] truncate">{alert.medicineName}</span>
                        <span className="font-mono text-[10px] text-slate-400">#{alert.batchNumber}</span>
                      </div>
                      <p className="text-[11px] text-slate-500 font-medium">
                        Expires: <strong className="text-slate-800">{alert.expiryDate}</strong> • {alert.quantity} units
                      </p>
                    </div>

                    <span
                      className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider whitespace-nowrap shrink-0 ${
                        alert.level === "expired"
                          ? "bg-rose-600 text-white"
                          : alert.level === "urgent"
                          ? "bg-rose-500 text-white"
                          : alert.level === "warning"
                          ? "bg-yellow-400 text-slate-950 font-bold"
                          : "bg-teal-100 text-teal-800"
                      }`}
                    >
                      {alert.level === "expired"
                        ? "EXPIRED"
                        : alert.daysLeft <= 0
                        ? "EXPIRES TODAY"
                        : `${alert.daysLeft} Days Left`}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: RECENT SALES & TOP SELLING MEDICINES (5 Cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Top Selling Medicines (Phase 10) */}
          <div className="bg-white rounded-3xl border border-slate-200 p-5 space-y-3 shadow-xs">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-teal-600" />
                <h3 className="text-sm font-extrabold text-[#1E3A5F] uppercase tracking-wider">
                  Top-Selling Medicines
                </h3>
              </div>
              <span className="text-[11px] text-slate-400 font-medium">All Time</span>
            </div>

            {salesStats.topSelling.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                No completed sales recorded yet. Top sellers will rank here automatically after dispensing.
              </div>
            ) : (
              <div className="space-y-2">
                {salesStats.topSelling.slice(0, 5).map((item) => (
                  <div
                    key={item.medicineId}
                    className="p-2.5 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-6 h-6 rounded-full bg-teal-100 text-teal-800 font-black text-xs flex items-center justify-center shrink-0">
                        {item.rank}
                      </span>
                      <div className="min-w-0">
                        <h4 className="font-extrabold text-[#1E3A5F] truncate">{item.medicineName}</h4>
                        <span className="text-[10px] text-slate-400 font-medium">
                          {item.salesCount} transactions
                        </span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="font-black text-teal-800 text-xs">{item.totalQuantitySold} sold</span>
                      <span className="block text-[10px] text-slate-400 font-mono">₹{item.totalRevenue}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent Sales Activity */}
          <div className="bg-white rounded-3xl border border-slate-200 p-5 space-y-3 shadow-xs">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Receipt className="w-4 h-4 text-teal-600" />
                <h3 className="text-sm font-extrabold text-[#1E3A5F] uppercase tracking-wider">
                  Recent Transactions
                </h3>
              </div>
              <Link href="/reports" className="text-xs font-bold text-teal-700 hover:underline">
                View Log
              </Link>
            </div>

            {salesStats.recentSales.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                No recent transactions found.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {salesStats.recentSales.map((sale) => (
                  <div key={sale.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                    <div className="space-y-0.5 min-w-0">
                      <h4 className="font-extrabold text-[#1E3A5F] truncate">{sale.medicineName}</h4>
                      <p className="text-[11px] text-slate-500 font-medium">
                        {sale.quantity} units • {sale.patientName || "Walk-in"} •{" "}
                        {new Date(sale.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="font-black text-emerald-700 font-mono">
                        ₹{Number(sale.totalPrice).toFixed(2)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Barcode Scanner Modal */}
      {scannerOpen && (
        <BarcodeScannerModal
          mode={scannerMode}
          onClose={() => setScannerOpen(false)}
          onSelectMode={(m) => setScannerMode(m)}
        />
      )}
    </div>
  );
}
