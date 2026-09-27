"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  BarChart2,
  ClipboardList,
  Trash2,
  Download,
  Printer,
  Search,
  CheckCircle2,
  AlertTriangle,
  X,
  TrendingUp,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
interface SaleRow {
  id: number;
  medicineName: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  discountPercent: number;
  discountAmount: number;
  totalPrice: number;
  patientName: string | null;
  doctorName: string | null;
  batchDetails: string | null;
  createdAt: string;
  staffName: string | null;
}

interface WastageRow {
  id: number;
  medicineName: string;
  batchNumber: string;
  quantity: number;
  reason: string;
  performedByName: string | null;
  date: string;
}

// ─── CSV helpers ──────────────────────────────────────────────────────────────
function escapeCsv(v: unknown): string {
  const s = v == null ? "" : String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n"))
    return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function downloadCsv(filename: string, headers: string[], rows: unknown[][]) {
  const lines = [
    headers.map(escapeCsv).join(","),
    ...rows.map((r) => r.map(escapeCsv).join(",")),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("en-IN", {
      day: "2-digit", month: "short", year: "numeric",
    });
  } catch { return iso; }
}
function fmtTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString("en-IN", {
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return ""; }
}

function parseBatchSummary(raw: string | null): string {
  if (!raw) return "—";
  try {
    const arr = JSON.parse(raw) as Array<{ batchNumber: string; deductedQuantity: number }>;
    return arr.map((b) => `${b.batchNumber}(−${b.deductedQuantity})`).join(", ");
  } catch { return raw; }
}

const REASON_LABELS: Record<string, string> = {
  expired:      "Expired",
  damaged:      "Damaged",
  contaminated: "Contaminated",
  recalled:     "Recalled",
  other:        "Other",
};

// ─── Print helper ─────────────────────────────────────────────────────────────
// Opens a clean new window that contains ONLY the report table and triggers
// the browser print dialog from there.  This avoids the blank-preview problem
// caused by Next.js's nested DOM structure intercepting @media print rules.
function openPrintWindow(
  tab: "sales" | "wastage" | "top-sellers" | "low-stock",
  salesData: SaleRow[],
  wastageData: WastageRow[],
  topSellingData: any[],
  lowStockData: any[],
  startDate: string,
  endDate: string,
  medicine: string,
  reason: string,
) {
  const title =
    tab === "sales"
      ? "Sales Report"
      : tab === "wastage"
      ? "Wastage Report"
      : tab === "top-sellers"
      ? "Top-Selling Medicines Report"
      : "Low-Stock Reorder Report";

  const periodLine =
    startDate && endDate
      ? `Period: ${startDate} to ${endDate}`
      : "All dates";
  const filterLine = [
    medicine ? `Medicine: ${medicine}` : "",
    reason && tab === "wastage" ? `Reason: ${REASON_LABELS[reason] ?? reason}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  const generated = new Date().toLocaleString("en-IN");

  const salesTotalQty = salesData.reduce((s, r) => s + r.quantity, 0);
  const salesTotalAmt = salesData.reduce((s, r) => s + Number(r.totalPrice), 0);
  const wastageTotal  = wastageData.reduce((s, r) => s + r.quantity, 0);

  // ── build the table rows ──
  let tableHead = "";
  let tableBody = "";
  let totalsRow = "";

  if (tab === "sales") {
    tableHead = `
      <tr>
        <th>Date</th><th>Time</th><th>Medicine</th><th>Batch(es)</th>
        <th>Qty</th><th>Unit Price (₹)</th><th>Total (₹)</th>
        <th>Patient</th><th>Staff</th>
      </tr>`;
    tableBody = salesData
      .map(
        (s) => `
      <tr>
        <td>${fmtDate(s.createdAt)}</td>
        <td>${fmtTime(s.createdAt)}</td>
        <td>${s.medicineName}</td>
        <td>${parseBatchSummary(s.batchDetails)}</td>
        <td style="text-align:center">${s.quantity}</td>
        <td style="text-align:right">₹${Number(s.unitPrice).toFixed(2)}</td>
        <td style="text-align:right">₹${Number(s.totalPrice).toFixed(2)}${
          Number(s.discountPercent) > 0
            ? ` <small style="color:#b45309">(−${s.discountPercent}%)</small>`
            : ""
        }</td>
        <td>${s.patientName ?? "Walk-in"}</td>
        <td>${s.staffName ?? "—"}</td>
      </tr>`
      )
      .join("");
    totalsRow = `
      <tr class="totals">
        <td colspan="4"><strong>TOTAL</strong></td>
        <td style="text-align:center"><strong>${salesTotalQty}</strong></td>
        <td></td>
        <td style="text-align:right"><strong>₹${salesTotalAmt.toFixed(2)}</strong></td>
        <td colspan="2">${salesData.length} transactions</td>
      </tr>`;
  } else if (tab === "top-sellers") {
    tableHead = `
      <tr>
        <th>Rank</th><th>Medicine Name</th><th>Manufacturer</th>
        <th>Units Sold</th><th>Total Revenue (₹)</th><th>Transactions</th>
      </tr>`;
    const totalSold = topSellingData.reduce((acc, t) => acc + (t.totalQuantitySold || 0), 0);
    const totalRev = topSellingData.reduce((acc, t) => acc + (Number(t.totalRevenue) || 0), 0);
    tableBody = topSellingData
      .map(
        (t) => `
      <tr>
        <td style="text-align:center">#${t.rank}</td>
        <td><strong>${t.medicineName}</strong></td>
        <td>${t.manufacturer ?? "—"}</td>
        <td style="text-align:center">${t.totalQuantitySold}</td>
        <td style="text-align:right">₹${Number(t.totalRevenue).toFixed(2)}</td>
        <td style="text-align:center">${t.salesCount}</td>
      </tr>`
      )
      .join("");
    totalsRow = `
      <tr class="totals">
        <td colspan="3"><strong>TOTAL</strong></td>
        <td style="text-align:center"><strong>${totalSold}</strong></td>
        <td style="text-align:right"><strong>₹${totalRev.toFixed(2)}</strong></td>
        <td>${topSellingData.length} products</td>
      </tr>`;
  } else if (tab === "low-stock") {
    tableHead = `
      <tr>
        <th>Medicine Name</th><th>Manufacturer</th><th>Available Stock</th>
        <th>Threshold</th><th>Status</th><th>Supplier</th>
      </tr>`;
    tableBody = lowStockData
      .map(
        (m) => `
      <tr>
        <td><strong>${m.name}</strong></td>
        <td>${m.manufacturer ?? "—"}</td>
        <td style="text-align:center; color:#dc2626"><strong>${m.totalStock}</strong></td>
        <td style="text-align:center">${m.reorderThreshold}</td>
        <td>${m.status === "order_pending" ? "Order Pending" : "Needs Reorder"}</td>
        <td>${m.supplier?.name ? `${m.supplier.name} (${m.supplier.phone ?? ""})` : "—"}</td>
      </tr>`
      )
      .join("");
    totalsRow = `
      <tr class="totals">
        <td colspan="2"><strong>ITEMS NEEDING ATTENTION</strong></td>
        <td style="text-align:center"><strong>${lowStockData.length}</strong></td>
        <td colspan="3">medicines below threshold</td>
      </tr>`;
  } else {
    tableHead = `
      <tr>
        <th>Date</th><th>Time</th><th>Medicine</th><th>Batch</th>
        <th>Qty Written Off</th><th>Reason</th><th>Staff</th>
      </tr>`;
    tableBody = wastageData
      .map(
        (w) => `
      <tr>
        <td>${fmtDate(w.date)}</td>
        <td>${fmtTime(w.date)}</td>
        <td>${w.medicineName}</td>
        <td>${w.batchNumber}</td>
        <td style="text-align:center">−${w.quantity}</td>
        <td>${REASON_LABELS[w.reason] ?? w.reason}</td>
        <td>${w.performedByName ?? "—"}</td>
      </tr>`
      )
      .join("");
    totalsRow = `
      <tr class="totals">
        <td colspan="4"><strong>TOTAL UNITS WRITTEN OFF</strong></td>
        <td style="text-align:center"><strong>−${wastageTotal}</strong></td>
        <td colspan="2">${wastageData.length} records</td>
      </tr>`;
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>MedTrack — ${title}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 11px;
      color: #1e293b;
      padding: 20px;
    }
    .header { margin-bottom: 16px; border-bottom: 2px solid #0f766e; padding-bottom: 10px; }
    .header h1 { font-size: 18px; color: #0f766e; margin-bottom: 4px; }
    .header .subtitle { font-size: 11px; color: #475569; }
    .meta { margin-bottom: 12px; font-size: 10px; color: #64748b; }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 8px;
      font-size: 10px;
    }
    thead { display: table-header-group; }
    th {
      background: #f1f5f9;
      border: 1px solid #cbd5e1;
      padding: 5px 7px;
      text-align: left;
      font-weight: bold;
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: #1e3a5f;
    }
    td {
      border: 1px solid #e2e8f0;
      padding: 5px 7px;
      vertical-align: top;
    }
    tr:nth-child(even) td { background: #f8fafc; }
    tr.totals td {
      background: #ecfdf5;
      border-top: 2px solid #10b981;
      font-size: 10px;
    }
    .footer {
      margin-top: 20px;
      font-size: 9px;
      color: #94a3b8;
      text-align: center;
      border-top: 1px solid #e2e8f0;
      padding-top: 8px;
    }
    @page {
      size: A4 landscape;
      margin: 15mm;
    }
    @media print {
      body { padding: 0; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>MedTrack — ${title}</h1>
    <div class="subtitle">Pharmacy Inventory &amp; Patient Management System</div>
  </div>
  <div class="meta">
    <strong>${periodLine}</strong>${filterLine ? " &nbsp;·&nbsp; " + filterLine : ""}
    &nbsp;·&nbsp; Generated: ${generated}
  </div>
  <table>
    <thead>${tableHead}</thead>
    <tbody>${tableBody}${totalsRow}</tbody>
  </table>
  <div class="footer">MedTrack FEFO Pharmacy Management System — Confidential</div>
  <script>
    window.onload = function() {
      window.print();
    };
  <\/script>
</body>
</html>`;

  const w = window.open("", "_blank");
  if (!w) {
    alert("Please allow pop-ups for this site to use Print / PDF.");
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function ReportsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [tab, setTab] = useState<"sales" | "wastage" | "top-sellers" | "low-stock">("sales");

  // Filters
  const [startDate, setStartDate] = useState("");
  const [endDate,   setEndDate]   = useState("");
  const [medicine,  setMedicine]  = useState("");
  const [reason,    setReason]    = useState("");

  // Data
  const [salesData,      setSalesData]      = useState<SaleRow[]>([]);
  const [wastageData,    setWastageData]    = useState<WastageRow[]>([]);
  const [topSellingData, setTopSellingData] = useState<any[]>([]);
  const [lowStockData,   setLowStockData]   = useState<any[]>([]);
  const [loading,        setLoading]        = useState(false);
  const [errorMsg,       setErrorMsg]       = useState("");

  // Auth guard
  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  // Fetch helpers
  const fetchSales = useCallback(async () => {
    setLoading(true);
    setErrorMsg("");
    try {
      const params = new URLSearchParams();
      if (startDate) params.set("startDate", startDate);
      if (endDate)   params.set("endDate",   endDate);
      if (medicine)  params.set("medicine",  medicine);
      const res = await fetch(`/api/sales-log?${params}`);
      if (res.ok) setSalesData(await res.json());
      else setErrorMsg("Failed to load sales data.");
    } catch { setErrorMsg("Network error loading sales."); }
    finally  { setLoading(false); }
  }, [startDate, endDate, medicine]);

  const fetchWastage = useCallback(async () => {
    setLoading(true);
    setErrorMsg("");
    try {
      const params = new URLSearchParams();
      if (startDate) params.set("startDate", startDate);
      if (endDate)   params.set("endDate",   endDate);
      if (medicine)  params.set("medicine",  medicine);
      if (reason)    params.set("reason",    reason);
      const res = await fetch(`/api/wastage?${params}`);
      if (res.ok) setWastageData(await res.json());
      else setErrorMsg("Failed to load wastage data.");
    } catch { setErrorMsg("Network error loading wastage."); }
    finally  { setLoading(false); }
  }, [startDate, endDate, medicine, reason]);

  const fetchTopSellers = useCallback(async () => {
    setLoading(true);
    setErrorMsg("");
    try {
      const params = new URLSearchParams();
      if (startDate) {
        params.set("period", "custom");
        params.set("startDate", startDate);
        if (endDate) params.set("endDate", endDate);
      } else {
        params.set("period", "all");
      }
      const res = await fetch(`/api/sales/stats?${params}`);
      if (res.ok) {
        const data = await res.json();
        setTopSellingData(data.topSelling || []);
      } else {
        setErrorMsg("Failed to load top selling medicines.");
      }
    } catch {
      setErrorMsg("Network error loading top sellers.");
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  const fetchLowStock = useCallback(async () => {
    setLoading(true);
    setErrorMsg("");
    try {
      const res = await fetch("/api/restock-status");
      if (res.ok) setLowStockData(await res.json());
      else setErrorMsg("Failed to load low-stock report.");
    } catch {
      setErrorMsg("Network error loading low stock report.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load + refetch when tab changes
  useEffect(() => {
    if (status !== "authenticated") return;
    if (tab === "sales") fetchSales();
    else if (tab === "wastage") fetchWastage();
    else if (tab === "top-sellers") fetchTopSellers();
    else if (tab === "low-stock") fetchLowStock();
  }, [status, tab]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleApply() {
    if (tab === "sales") fetchSales();
    else if (tab === "wastage") fetchWastage();
    else if (tab === "top-sellers") fetchTopSellers();
    else if (tab === "low-stock") fetchLowStock();
  }

  function handleClearFilters() {
    setStartDate(""); setEndDate(""); setMedicine(""); setReason("");
    setTimeout(() => {
      if (tab === "sales") fetchSales();
      else if (tab === "wastage") fetchWastage();
      else if (tab === "top-sellers") fetchTopSellers();
      else if (tab === "low-stock") fetchLowStock();
    }, 0);
  }

  // CSV exports
  function exportSalesCsv() {
    const headers = ["Date", "Time", "Medicine", "Batch(es)", "Qty",
      "Unit Price (₹)", "Subtotal (₹)", "Discount %", "Total (₹)",
      "Patient", "Doctor", "Staff"];
    const rows = salesData.map((s) => [
      fmtDate(s.createdAt), fmtTime(s.createdAt),
      s.medicineName, parseBatchSummary(s.batchDetails),
      s.quantity, Number(s.unitPrice).toFixed(2),
      Number(s.subtotal).toFixed(2), s.discountPercent,
      Number(s.totalPrice).toFixed(2),
      s.patientName ?? "", s.doctorName ?? "", s.staffName ?? "",
    ]);
    const tag = startDate && endDate ? `_${startDate}_to_${endDate}` : "";
    downloadCsv(`MedTrack_Sales_Report${tag}.csv`, headers, rows);
  }

  function exportWastageCsv() {
    const headers = ["Date", "Time", "Medicine", "Batch",
      "Qty Written Off", "Reason", "Staff"];
    const rows = wastageData.map((w) => [
      fmtDate(w.date), fmtTime(w.date),
      w.medicineName, w.batchNumber,
      w.quantity, REASON_LABELS[w.reason] ?? w.reason,
      w.performedByName ?? "",
    ]);
    const tag = startDate && endDate ? `_${startDate}_to_${endDate}` : "";
    downloadCsv(`MedTrack_Wastage_Report${tag}.csv`, headers, rows);
  }

  function exportTopSellersCsv() {
    const headers = ["Rank", "Medicine Name", "Units Sold", "Total Revenue (₹)", "Transaction Count"];
    const rows = displayTopSelling.map((t) => [
      t.rank,
      t.medicineName,
      t.totalQuantitySold,
      Number(t.totalRevenue).toFixed(2),
      t.salesCount,
    ]);
    downloadCsv(`MedTrack_Top_Sellers_Report.csv`, headers, rows);
  }

  function exportLowStockCsv() {
    const headers = ["Medicine Name", "Manufacturer", "Available Stock", "Minimum Threshold", "Status"];
    const rows = displayLowStock.map((m) => [
      m.name,
      m.manufacturer,
      m.totalStock,
      m.reorderThreshold,
      m.status === "order_pending" ? "Order Pending" : "Needs Reorder",
    ]);
    downloadCsv(`MedTrack_Low_Stock_Report.csv`, headers, rows);
  }

  function handleExport() {
    if (tab === "sales") exportSalesCsv();
    else if (tab === "wastage") exportWastageCsv();
    else if (tab === "top-sellers") exportTopSellersCsv();
    else if (tab === "low-stock") exportLowStockCsv();
  }

  function handlePrint() {
    openPrintWindow(tab, salesData, wastageData, topSellingData, lowStockData, startDate, endDate, medicine, reason);
  }

  // Summary totals & filter overlays
  const displayTopSelling = medicine.trim()
    ? topSellingData.filter((t) =>
        t.medicineName?.toLowerCase().includes(medicine.toLowerCase()) ||
        t.manufacturer?.toLowerCase().includes(medicine.toLowerCase())
      )
    : topSellingData;

  const displayLowStock = medicine.trim()
    ? lowStockData.filter((m) =>
        m.name?.toLowerCase().includes(medicine.toLowerCase()) ||
        m.manufacturer?.toLowerCase().includes(medicine.toLowerCase())
      )
    : lowStockData;

  const salesTotalQty = salesData.reduce((s, r) => s + r.quantity, 0);
  const salesTotalAmt = salesData.reduce((s, r) => s + Number(r.totalPrice), 0);
  const wastageTotal  = wastageData.reduce((s, r) => s + r.quantity, 0);
  const hasFilters    = startDate || endDate || medicine || reason;

  if (status === "loading") return null;

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 pb-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#1E3A5F] tracking-tight flex items-center gap-3">
            <BarChart2 className="w-8 h-8 text-teal-600" />
            <span>Reports &amp; Analytics</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 font-medium">
            View, filter, analyze, and export sales, wastage, top-selling products, and inventory stock reports.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleExport}
            className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-extrabold flex items-center gap-2 shadow-sm transition-colors cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Export CSV</span>
          </button>
          <button
            onClick={handlePrint}
            className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-extrabold flex items-center gap-2 border border-slate-200 transition-colors cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>Print / PDF</span>
          </button>
        </div>
      </div>

      {/* Tab switcher */}
      <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-2xl border border-slate-200 overflow-x-auto w-full sm:w-fit">
        <button
          onClick={() => { setTab("sales"); setMedicine(""); setReason(""); }}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-extrabold whitespace-nowrap transition-all cursor-pointer ${
            tab === "sales"
              ? "bg-white text-teal-700 shadow-xs border border-slate-200"
              : "text-slate-600 hover:bg-white/60"
          }`}
        >
          <ClipboardList className="w-4 h-4" />
          <span>Sales Report</span>
        </button>
        <button
          onClick={() => { setTab("top-sellers"); setMedicine(""); setReason(""); }}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-extrabold whitespace-nowrap transition-all cursor-pointer ${
            tab === "top-sellers"
              ? "bg-white text-teal-700 shadow-xs border border-slate-200"
              : "text-slate-600 hover:bg-white/60"
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          <span>Top-Selling</span>
        </button>
        <button
          onClick={() => { setTab("low-stock"); setMedicine(""); setReason(""); }}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-extrabold whitespace-nowrap transition-all cursor-pointer ${
            tab === "low-stock"
              ? "bg-white text-amber-800 shadow-xs border border-slate-200"
              : "text-slate-600 hover:bg-white/60"
          }`}
        >
          <AlertTriangle className="w-4 h-4 text-amber-600" />
          <span>Low-Stock Reorders</span>
        </button>
        <button
          onClick={() => { setTab("wastage"); setMedicine(""); setReason(""); }}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-extrabold whitespace-nowrap transition-all cursor-pointer ${
            tab === "wastage"
              ? "bg-white text-rose-700 shadow-xs border border-slate-200"
              : "text-slate-600 hover:bg-white/60"
          }`}
        >
          <Trash2 className="w-4 h-4" />
          <span>Wastage Report</span>
        </button>
      </div>

      {/* Filter bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3 shadow-xs">
        <div className="flex items-center gap-2 text-xs font-extrabold text-[#1E3A5F] uppercase tracking-wider">
          <Search className="w-4 h-4 text-teal-600" />
          <span>Filter Records</span>
          {hasFilters && (
            <button
              onClick={handleClearFilters}
              className="ml-auto flex items-center gap-1 text-[10px] text-slate-500 hover:text-rose-600 font-bold cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />Clear filters
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <div>
            <label className="block text-slate-600 font-bold mb-1">From Date</label>
            <input
              type="date" value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:border-teal-500 font-medium"
            />
          </div>
          <div>
            <label className="block text-slate-600 font-bold mb-1">To Date</label>
            <input
              type="date" value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:border-teal-500 font-medium"
            />
          </div>
          <div>
            <label className="block text-slate-600 font-bold mb-1">Medicine</label>
            <input
              type="text" value={medicine}
              onChange={(e) => setMedicine(e.target.value)}
              placeholder="e.g. Paracetamol"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:border-teal-500 font-medium"
            />
          </div>
          <div>
            <label className="block text-slate-600 font-bold mb-1">
              Reason
              {tab !== "wastage" && (
                <span className="ml-1 text-[10px] text-slate-400 font-normal">(Wastage only)</span>
              )}
            </label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={tab !== "wastage"}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:border-teal-500 font-medium disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <option value="">All reasons</option>
              {Object.entries(REASON_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            onClick={handleApply}
            disabled={loading}
            className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-xs font-extrabold flex items-center gap-2 shadow-sm transition-colors cursor-pointer"
          >
            <Search className="w-3.5 h-3.5" />
            {loading ? "Loading…" : "Apply Filters"}
          </button>
        </div>
      </div>

      {/* Error */}
      {errorMsg && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* ── SALES TAB ─────────────────────────────────────────────────────── */}
      {tab === "sales" && (
        <div className="space-y-4">
          {salesData.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs text-xs">
                <span className="text-slate-500 font-bold uppercase tracking-wider block mb-1">Transactions</span>
                <span className="text-2xl font-extrabold text-[#1E3A5F]">{salesData.length}</span>
              </div>
              <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs text-xs">
                <span className="text-slate-500 font-bold uppercase tracking-wider block mb-1">Units Dispensed</span>
                <span className="text-2xl font-extrabold text-teal-700">{salesTotalQty}</span>
              </div>
              <div className="p-4 rounded-2xl bg-white border border-teal-200 shadow-xs text-xs col-span-2 sm:col-span-1">
                <span className="text-slate-500 font-bold uppercase tracking-wider block mb-1">Total Revenue</span>
                <span className="text-2xl font-extrabold text-teal-700">₹{salesTotalAmt.toFixed(2)}</span>
              </div>
            </div>
          )}

          {loading ? (
            <p className="text-center py-10 text-slate-500 text-xs font-bold">Loading…</p>
          ) : salesData.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center space-y-3 shadow-xs">
              <CheckCircle2 className="w-10 h-10 text-slate-300 mx-auto" />
              <p className="text-sm font-extrabold text-[#1E3A5F]">No sales records found.</p>
              <p className="text-xs text-slate-500">Try adjusting your filters or date range.</p>
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-left">
                        {["Date & Time", "Medicine", "Batch(es)", "Qty", "Unit ₹", "Total ₹", "Patient", "Staff"].map((h) => (
                          <th key={h} className="px-4 py-3 font-extrabold text-[#1E3A5F] uppercase tracking-wider whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {salesData.map((s) => (
                        <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3 font-mono text-slate-600 whitespace-nowrap">
                            {fmtDate(s.createdAt)}
                            <span className="block text-[10px] text-slate-400">{fmtTime(s.createdAt)}</span>
                          </td>
                          <td className="px-4 py-3 font-extrabold text-[#1E3A5F]">{s.medicineName}</td>
                          <td className="px-4 py-3 font-mono text-slate-600 text-[11px]">{parseBatchSummary(s.batchDetails)}</td>
                          <td className="px-4 py-3 text-center font-bold text-slate-800">{s.quantity}</td>
                          <td className="px-4 py-3 text-right font-medium text-slate-700">₹{Number(s.unitPrice).toFixed(2)}</td>
                          <td className="px-4 py-3 text-right font-extrabold text-teal-700">
                            ₹{Number(s.totalPrice).toFixed(2)}
                            {Number(s.discountPercent) > 0 && (
                              <span className="block text-[10px] text-amber-600 font-bold">-{s.discountPercent}%</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-slate-600">{s.patientName ?? <span className="text-slate-400 italic">Walk-in</span>}</td>
                          <td className="px-4 py-3 text-slate-600">{s.staffName ?? "—"}</td>
                        </tr>
                      ))}
                      <tr className="bg-teal-50 border-t-2 border-teal-200">
                        <td colSpan={3} className="px-4 py-3 font-extrabold text-[#1E3A5F] text-xs uppercase">Total</td>
                        <td className="px-4 py-3 text-center font-extrabold text-teal-700">{salesTotalQty}</td>
                        <td></td>
                        <td className="px-4 py-3 text-right font-extrabold text-teal-700">₹{salesTotalAmt.toFixed(2)}</td>
                        <td colSpan={2} className="px-4 py-3 text-slate-500 text-[11px]">{salesData.length} transactions</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Mobile cards */}
              <div className="md:hidden space-y-3">
                {salesData.map((s) => (
                  <div key={s.id} className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3 shadow-xs text-xs">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-extrabold text-[#1E3A5F] text-sm">{s.medicineName}</p>
                        <p className="text-slate-500 font-medium mt-0.5">
                          {fmtDate(s.createdAt)} · {fmtTime(s.createdAt)}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-base font-black text-teal-700">₹{Number(s.totalPrice).toFixed(2)}</span>
                        {Number(s.discountPercent) > 0 && (
                          <span className="block text-[10px] text-amber-600 font-bold">-{s.discountPercent}%</span>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600 border-t border-slate-100 pt-2">
                      <div><span className="text-slate-400 font-bold uppercase text-[9px] block">Qty</span>{s.quantity} units</div>
                      <div><span className="text-slate-400 font-bold uppercase text-[9px] block">Patient</span>{s.patientName ?? "Walk-in"}</div>
                      <div className="col-span-2"><span className="text-slate-400 font-bold uppercase text-[9px] block">Batch(es)</span>{parseBatchSummary(s.batchDetails)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── TOP-SELLERS TAB ───────────────────────────────────────────────── */}
      {tab === "top-sellers" && (
        <div className="space-y-4">
          {displayTopSelling.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs text-xs">
                <span className="text-slate-500 font-bold uppercase tracking-wider block mb-1">Ranked Products</span>
                <span className="text-2xl font-extrabold text-[#1E3A5F]">{displayTopSelling.length}</span>
              </div>
              <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs text-xs">
                <span className="text-slate-500 font-bold uppercase tracking-wider block mb-1">Total Units Sold</span>
                <span className="text-2xl font-extrabold text-teal-700">
                  {displayTopSelling.reduce((acc, t) => acc + (t.totalQuantitySold || 0), 0)}
                </span>
              </div>
              <div className="p-4 rounded-2xl bg-white border border-teal-200 shadow-xs text-xs">
                <span className="text-slate-500 font-bold uppercase tracking-wider block mb-1">Top-Sellers Revenue</span>
                <span className="text-2xl font-extrabold text-teal-700">
                  ₹{displayTopSelling.reduce((acc, t) => acc + (Number(t.totalRevenue) || 0), 0).toFixed(2)}
                </span>
              </div>
            </div>
          )}

          {loading ? (
            <p className="text-center py-10 text-slate-500 text-xs font-bold">Loading…</p>
          ) : displayTopSelling.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center space-y-3 shadow-xs">
              <CheckCircle2 className="w-10 h-10 text-slate-300 mx-auto" />
              <p className="text-sm font-extrabold text-[#1E3A5F]">No top-selling product data found.</p>
              <p className="text-xs text-slate-500">Sales records will appear here as orders are dispensed.</p>
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-left">
                        {["Rank", "Medicine Name", "Manufacturer", "Units Sold", "Total Revenue", "Transactions"].map((h) => (
                          <th key={h} className="px-4 py-3 font-extrabold text-[#1E3A5F] uppercase tracking-wider whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {displayTopSelling.map((t) => (
                        <tr key={t.medicineId} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-black ${
                              t.rank === 1 ? "bg-amber-100 text-amber-800 border border-amber-300"
                              : t.rank === 2 ? "bg-slate-200 text-slate-700 border border-slate-300"
                              : t.rank === 3 ? "bg-amber-50 text-amber-700 border border-amber-200"
                              : "bg-slate-50 text-slate-600"
                            }`}>
                              #{t.rank}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-extrabold text-[#1E3A5F]">{t.medicineName}</td>
                          <td className="px-4 py-3 text-slate-600">{t.manufacturer || "—"}</td>
                          <td className="px-4 py-3 text-center">
                            <span className="font-extrabold text-teal-700 text-sm">{t.totalQuantitySold}</span>
                            <span className="block text-[10px] text-slate-400">units</span>
                          </td>
                          <td className="px-4 py-3 text-right font-extrabold text-[#1E3A5F]">
                            ₹{Number(t.totalRevenue).toFixed(2)}
                          </td>
                          <td className="px-4 py-3 text-center text-slate-600 font-medium">
                            {t.salesCount}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Mobile cards */}
              <div className="md:hidden space-y-3">
                {displayTopSelling.map((t) => (
                  <div key={t.medicineId} className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center justify-between gap-3 text-xs shadow-xs">
                    <div className="flex items-center gap-3">
                      <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-xs font-black shrink-0 ${
                        t.rank === 1 ? "bg-amber-100 text-amber-800 border border-amber-300"
                        : t.rank === 2 ? "bg-slate-200 text-slate-700 border border-slate-300"
                        : t.rank === 3 ? "bg-amber-50 text-amber-700 border border-amber-200"
                        : "bg-slate-50 text-slate-600"
                      }`}>
                        #{t.rank}
                      </span>
                      <div>
                        <p className="font-extrabold text-[#1E3A5F] text-sm">{t.medicineName}</p>
                        <p className="text-slate-500 text-[11px]">{t.manufacturer || "—"} · {t.salesCount} orders</p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-base font-black text-teal-700">₹{Number(t.totalRevenue).toFixed(2)}</span>
                      <span className="block text-[10px] text-slate-500 font-bold">{t.totalQuantitySold} sold</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── LOW-STOCK TAB ─────────────────────────────────────────────────── */}
      {tab === "low-stock" && (
        <div className="space-y-4">
          {displayLowStock.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-4 rounded-2xl bg-white border border-rose-200 shadow-xs text-xs">
                <span className="text-slate-500 font-bold uppercase tracking-wider block mb-1">Medicines Needing Reorder</span>
                <span className="text-2xl font-extrabold text-rose-600">{displayLowStock.length}</span>
              </div>
              <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs text-xs">
                <span className="text-slate-500 font-bold uppercase tracking-wider block mb-1">Orders Pending</span>
                <span className="text-2xl font-extrabold text-amber-600">
                  {displayLowStock.filter((m) => m.status === "order_pending").length}
                </span>
              </div>
              <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs text-xs">
                <span className="text-slate-500 font-bold uppercase tracking-wider block mb-1">Critical (No Order Placed)</span>
                <span className="text-2xl font-extrabold text-rose-700">
                  {displayLowStock.filter((m) => m.status === "needs_reorder").length}
                </span>
              </div>
            </div>
          )}

          {loading ? (
            <p className="text-center py-10 text-slate-500 text-xs font-bold">Loading…</p>
          ) : displayLowStock.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center space-y-3 shadow-xs">
              <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
              <p className="text-sm font-extrabold text-[#1E3A5F]">All stocks are healthy!</p>
              <p className="text-xs text-slate-500">No medicines currently fall at or below their reorder thresholds.</p>
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-left">
                        {["Medicine Name", "Manufacturer", "Schedule", "Available Stock", "Min Threshold", "Status", "Action"].map((h) => (
                          <th key={h} className="px-4 py-3 font-extrabold text-[#1E3A5F] uppercase tracking-wider whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {displayLowStock.map((m) => (
                        <tr key={m.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3 font-extrabold text-[#1E3A5F]">{m.name}</td>
                          <td className="px-4 py-3 text-slate-600">{m.manufacturer || "—"}</td>
                          <td className="px-4 py-3">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-slate-100 text-slate-700 border border-slate-200">
                              {m.schedule || "OTC"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="font-black text-rose-600 text-sm">{m.totalStock}</span>
                            <span className="block text-[10px] text-slate-400">units</span>
                          </td>
                          <td className="px-4 py-3 text-center font-bold text-slate-700">
                            {m.reorderThreshold} units
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {m.status === "order_pending" ? (
                              <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase bg-amber-50 text-amber-700 border border-amber-200">
                                Order Pending
                              </span>
                            ) : (
                              <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase bg-rose-50 text-rose-700 border border-rose-200">
                                Needs Reorder
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <Link
                              href="/restock"
                              className="px-3 py-1.5 rounded-xl bg-teal-50 hover:bg-teal-100 text-teal-700 font-extrabold text-[11px] border border-teal-200 transition-colors inline-block"
                            >
                              Restock Now
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Mobile cards */}
              <div className="md:hidden space-y-3">
                {displayLowStock.map((m) => (
                  <div key={m.id} className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3 text-xs shadow-xs">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-extrabold text-[#1E3A5F] text-sm">{m.name}</p>
                        <p className="text-slate-500 text-[11px]">{m.manufacturer || "—"}</p>
                      </div>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-slate-100 text-slate-700 border border-slate-200">
                        {m.schedule || "OTC"}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[11px] bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                      <div>
                        <span className="text-slate-400 font-bold uppercase text-[9px] block">Current Stock</span>
                        <span className="font-black text-rose-600 text-sm">{m.totalStock} units</span>
                      </div>
                      <div>
                        <span className="text-slate-400 font-bold uppercase text-[9px] block">Threshold</span>
                        <span className="font-bold text-slate-700">{m.reorderThreshold} units</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2 pt-1">
                      {m.status === "order_pending" ? (
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase bg-amber-50 text-amber-700 border border-amber-200">
                          Order Pending
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase bg-rose-50 text-rose-700 border border-rose-200">
                          Needs Reorder
                        </span>
                      )}
                      <Link
                        href="/restock"
                        className="px-3 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-extrabold text-[11px] transition-colors"
                      >
                        Restock Now
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── WASTAGE TAB ───────────────────────────────────────────────────── */}
      {tab === "wastage" && (
        <div className="space-y-4">
          {wastageData.length > 0 && (
            <div className="grid grid-cols-2 gap-3">
              <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs text-xs">
                <span className="text-slate-500 font-bold uppercase tracking-wider block mb-1">Records</span>
                <span className="text-2xl font-extrabold text-[#1E3A5F]">{wastageData.length}</span>
              </div>
              <div className="p-4 rounded-2xl bg-white border border-rose-200 shadow-xs text-xs">
                <span className="text-slate-500 font-bold uppercase tracking-wider block mb-1">Units Written Off</span>
                <span className="text-2xl font-extrabold text-rose-600">{wastageTotal}</span>
              </div>
            </div>
          )}

          {loading ? (
            <p className="text-center py-10 text-slate-500 text-xs font-bold">Loading…</p>
          ) : wastageData.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center space-y-3 shadow-xs">
              <CheckCircle2 className="w-10 h-10 text-slate-300 mx-auto" />
              <p className="text-sm font-extrabold text-[#1E3A5F]">No wastage records found.</p>
              <p className="text-xs text-slate-500">Try adjusting your filters or date range.</p>
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-left">
                        {["Date & Time", "Medicine", "Batch", "Qty Written Off", "Reason", "Staff"].map((h) => (
                          <th key={h} className="px-4 py-3 font-extrabold text-[#1E3A5F] uppercase tracking-wider whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {wastageData.map((w) => (
                        <tr key={w.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3 font-mono text-slate-600 whitespace-nowrap">
                            {fmtDate(w.date)}
                            <span className="block text-[10px] text-slate-400">{fmtTime(w.date)}</span>
                          </td>
                          <td className="px-4 py-3 font-extrabold text-[#1E3A5F]">{w.medicineName}</td>
                          <td className="px-4 py-3 font-mono text-slate-600">{w.batchNumber}</td>
                          <td className="px-4 py-3 text-center">
                            <span className="font-black text-rose-600 text-sm">−{w.quantity}</span>
                            <span className="block text-[10px] text-slate-400">units</span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase border ${
                              w.reason === "expired"        ? "bg-rose-100 text-rose-800 border-rose-200"
                              : w.reason === "damaged"      ? "bg-amber-100 text-amber-800 border-amber-200"
                              : w.reason === "contaminated" ? "bg-orange-100 text-orange-800 border-orange-200"
                              : w.reason === "recalled"     ? "bg-purple-100 text-purple-800 border-purple-200"
                              : "bg-slate-100 text-slate-700 border-slate-200"
                            }`}>
                              {REASON_LABELS[w.reason] ?? w.reason}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-600">{w.performedByName ?? "—"}</td>
                        </tr>
                      ))}
                      <tr className="bg-rose-50 border-t-2 border-rose-200">
                        <td colSpan={3} className="px-4 py-3 font-extrabold text-[#1E3A5F] text-xs uppercase">Total Written Off</td>
                        <td className="px-4 py-3 text-center font-extrabold text-rose-600">−{wastageTotal}</td>
                        <td colSpan={2} className="px-4 py-3 text-slate-500 text-[11px]">{wastageData.length} records</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Mobile cards */}
              <div className="md:hidden space-y-3">
                {wastageData.map((w) => (
                  <div key={w.id} className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-xs">
                    <div className="space-y-1.5 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-extrabold text-[#1E3A5F] text-sm">{w.medicineName}</span>
                        <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-slate-200 text-slate-700">Batch {w.batchNumber}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase border ${
                          w.reason === "expired"        ? "bg-rose-100 text-rose-800 border-rose-200"
                          : w.reason === "damaged"      ? "bg-amber-100 text-amber-800 border-amber-200"
                          : w.reason === "contaminated" ? "bg-orange-100 text-orange-800 border-orange-200"
                          : w.reason === "recalled"     ? "bg-purple-100 text-purple-800 border-purple-200"
                          : "bg-slate-100 text-slate-700 border-slate-200"
                        }`}>
                          {REASON_LABELS[w.reason] ?? w.reason}
                        </span>
                      </div>
                      <p className="text-slate-500 font-medium">
                        {fmtDate(w.date)} · {fmtTime(w.date)} · {w.performedByName ?? "—"}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <span className="text-lg font-black text-rose-600">−{w.quantity}</span>
                      <span className="block text-[10px] text-slate-500 font-bold">units</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
