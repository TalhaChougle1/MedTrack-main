"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  ShieldCheck,
  Search,
  Download,
  Calendar,
  Clock,
  User,
  Filter,
  CheckCircle2,
  AlertTriangle,
  LogOut,
  Activity,
  Layers,
  FileText,
  Lock,
  X,
} from "lucide-react";

interface AuditLogRow {
  id: number;
  shopId: number;
  userId: number | null;
  userName: string | null;
  userEmail: string | null;
  userRole: string | null;
  action: string;
  entityType: string | null;
  entityId: number | null;
  detail: string | null;
  timestamp: string;
}

interface UserSessionRow {
  id: number;
  shopId: number;
  userId: number;
  userName: string | null;
  sessionToken: string | null;
  loginTime: string;
  lastActivity: string;
  logoutTime: string | null;
  logoutReason: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  isActive: boolean;
}

export default function AuditLogsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<"audit" | "sessions">("audit");

  // Audit Logs State
  const [logs, setLogs] = useState<AuditLogRow[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [actionFilter, setActionFilter] = useState("ALL");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  // Sessions State
  const [sessionsList, setSessionsList] = useState<UserSessionRow[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);

  // Detail Modal
  const [selectedDetail, setSelectedDetail] = useState<any | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    } else if (status === "authenticated") {
      fetchAuditLogs();
      if (session.user.role === "owner") {
        fetchSessions();
      }
    }
  }, [status, router]);

  const fetchAuditLogs = useCallback(async () => {
    setLoadingLogs(true);
    try {
      const params = new URLSearchParams();
      if (actionFilter !== "ALL") params.set("action", actionFilter);
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      params.set("limit", "200");

      const res = await fetch(`/api/audit-logs?${params.toString()}`);
      if (res.ok) {
        setLogs(await res.json());
      }
    } catch (err) {
      console.error("Failed to load audit logs:", err);
    } finally {
      setLoadingLogs(false);
    }
  }, [actionFilter, startDate, endDate]);

  const fetchSessions = useCallback(async () => {
    setLoadingSessions(true);
    try {
      const res = await fetch("/api/auth/session-activity?all=true");
      if (res.ok) {
        setSessionsList(await res.json());
      }
    } catch (err) {
      console.error("Failed to load session logs:", err);
    } finally {
      setLoadingSessions(false);
    }
  }, []);

  useEffect(() => {
    if (status === "authenticated") {
      fetchAuditLogs();
    }
  }, [fetchAuditLogs, status]);

  // Filter logs by search query (user name, action, or detail)
  const filteredLogs = logs.filter((log) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    return (
      log.action?.toLowerCase().includes(q) ||
      log.userName?.toLowerCase().includes(q) ||
      log.userEmail?.toLowerCase().includes(q) ||
      log.detail?.toLowerCase().includes(q) ||
      log.entityType?.toLowerCase().includes(q)
    );
  });

  // Action badge colour styling
  const getActionBadge = (action: string) => {
    switch (action) {
      case "SELL":
        return "bg-emerald-100 text-emerald-800 border-emerald-300";
      case "STOCK_IN":
        return "bg-cyan-100 text-cyan-800 border-cyan-300";
      case "WASTAGE":
        return "bg-rose-100 text-rose-800 border-rose-300";
      case "MEDICINE_ADD":
        return "bg-teal-100 text-teal-800 border-teal-300";
      case "LOGIN":
        return "bg-blue-100 text-blue-800 border-blue-300";
      case "LOGOUT":
        return "bg-slate-100 text-slate-700 border-slate-300";
      case "SESSION_TIMEOUT":
        return "bg-amber-100 text-amber-800 border-amber-300";
      case "ORDER_CREATE":
      case "STATUS_UPDATE":
        return "bg-purple-100 text-purple-800 border-purple-300";
      default:
        return "bg-slate-100 text-slate-700 border-slate-200";
    }
  };

  // CSV Export for Compliance
  const handleExportCSV = () => {
    const headers = ["Timestamp", "Action", "User", "Role", "Module", "Record ID", "Detail"];
    const rows = filteredLogs.map((log) => [
      new Date(log.timestamp).toLocaleString("en-IN"),
      log.action,
      log.userName || "System",
      log.userRole || "—",
      log.entityType || "—",
      log.entityId || "—",
      (log.detail || "").replace(/"/g, '""'),
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((r) => `"${r.join('","')}"`)].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `MedTrack_Audit_Trail_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-teal-50 text-teal-800 border border-teal-200">
              Accountability &amp; Compliance Trail
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#1E3A5F] tracking-tight mt-1 flex items-center gap-2.5">
            <ShieldCheck className="w-8 h-8 text-teal-600" />
            <span>Audit Trail &amp; User Activity</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 font-medium">
            Immutable log of sales, stock updates, shelf write-offs, user sessions, and regulatory security events.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={handleExportCSV}
            className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-extrabold flex items-center gap-2 shadow-xs transition-colors cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Export Audit Trail (CSV)</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-2xl border border-slate-200 w-fit">
        <button
          onClick={() => setActiveTab("audit")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
            activeTab === "audit"
              ? "bg-white text-teal-800 shadow-xs border border-slate-200"
              : "text-slate-600 hover:bg-white/60"
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>Audit Trail Logs ({filteredLogs.length})</span>
        </button>

        {session?.user?.role === "owner" && (
          <button
            onClick={() => {
              setActiveTab("sessions");
              fetchSessions();
            }}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
              activeTab === "sessions"
                ? "bg-white text-teal-800 shadow-xs border border-slate-200"
                : "text-slate-600 hover:bg-white/60"
            }`}
          >
            <Activity className="w-4 h-4" />
            <span>User Sessions &amp; Security</span>
          </button>
        )}
      </div>

      {/* TAB 1: AUDIT LOGS */}
      {activeTab === "audit" && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="bg-white rounded-3xl border border-slate-200 p-4 shadow-xs space-y-3">
            <div className="flex flex-col sm:flex-row items-center gap-3">
              {/* Search */}
              <div className="relative flex-1 w-full">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search user, action, detail, or medicine..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:border-teal-500"
                />
              </div>

              {/* Action Filter */}
              <select
                value={actionFilter}
                onChange={(e) => setActionFilter(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:border-teal-500 cursor-pointer w-full sm:w-auto"
              >
                <option value="ALL">All Actions</option>
                <option value="SELL">SELL (Dispensing)</option>
                <option value="STOCK_IN">STOCK_IN (New Batch)</option>
                <option value="WASTAGE">WASTAGE (Write-Off)</option>
                <option value="MEDICINE_ADD">MEDICINE_ADD (Catalog)</option>
                <option value="LOGIN">LOGIN</option>
                <option value="LOGOUT">LOGOUT</option>
                <option value="SESSION_TIMEOUT">SESSION_TIMEOUT</option>
                <option value="ORDER_CREATE">ORDER_CREATE</option>
                <option value="STATUS_UPDATE">STATUS_UPDATE</option>
              </select>

              {/* Date Filters */}
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs text-slate-700 font-medium"
                  title="From date"
                />
                <span className="text-slate-400 text-xs">to</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs text-slate-700 font-medium"
                  title="To date"
                />
              </div>
            </div>
          </div>

          {/* Audit Logs Table */}
          <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-xs">
            {loadingLogs ? (
              <p className="text-center py-12 text-xs text-slate-400 font-medium">Loading audit trail...</p>
            ) : filteredLogs.length === 0 ? (
              <div className="py-12 text-center space-y-2">
                <ShieldCheck className="w-8 h-8 text-slate-300 mx-auto" />
                <p className="text-xs font-bold text-[#1E3A5F]">No audit entries match criteria.</p>
                <p className="text-[11px] text-slate-400">Try adjusting your filters or date range.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-left">
                      <th className="px-4 py-3 font-extrabold text-[#1E3A5F] uppercase tracking-wider">Date &amp; Time</th>
                      <th className="px-4 py-3 font-extrabold text-[#1E3A5F] uppercase tracking-wider">User</th>
                      <th className="px-4 py-3 font-extrabold text-[#1E3A5F] uppercase tracking-wider">Action</th>
                      <th className="px-4 py-3 font-extrabold text-[#1E3A5F] uppercase tracking-wider">Module</th>
                      <th className="px-4 py-3 font-extrabold text-[#1E3A5F] uppercase tracking-wider">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredLogs.map((log) => {
                      let parsedDetail: any = null;
                      try {
                        parsedDetail = log.detail ? JSON.parse(log.detail) : null;
                      } catch {
                        parsedDetail = log.detail;
                      }

                      return (
                        <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3 font-mono text-slate-600 whitespace-nowrap">
                            {new Date(log.timestamp).toLocaleDateString("en-IN", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            })}
                            <span className="block text-[10px] text-slate-400 font-mono">
                              {new Date(log.timestamp).toLocaleTimeString("en-IN", {
                                hour: "2-digit",
                                minute: "2-digit",
                                second: "2-digit",
                              })}
                            </span>
                          </td>

                          <td className="px-4 py-3">
                            <span className="font-extrabold text-[#1E3A5F] block">{log.userName || "System"}</span>
                            <span className="text-[10px] text-slate-400 uppercase font-semibold">
                              {log.userRole || "Staff"}
                            </span>
                          </td>

                          <td className="px-4 py-3 whitespace-nowrap">
                            <span
                              className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${getActionBadge(
                                log.action
                              )}`}
                            >
                              {log.action}
                            </span>
                          </td>

                          <td className="px-4 py-3 font-semibold text-slate-600 uppercase text-[10px]">
                            {log.entityType || "General"}
                          </td>

                          <td className="px-4 py-3 max-w-md">
                            {typeof parsedDetail === "object" && parsedDetail !== null ? (
                              <button
                                onClick={() => setSelectedDetail({ log, parsed: parsedDetail })}
                                className="text-left font-mono text-[11px] text-teal-700 hover:text-teal-900 underline truncate block max-w-xs sm:max-w-md cursor-pointer"
                              >
                                {parsedDetail.medicineName
                                  ? `${parsedDetail.medicineName} (${parsedDetail.requestedQuantity || parsedDetail.quantity || ""} units)`
                                  : parsedDetail.userName
                                  ? `${parsedDetail.userName} — ${parsedDetail.reason || log.action}`
                                  : JSON.stringify(parsedDetail).slice(0, 60) + "..."}
                              </button>
                            ) : (
                              <span className="font-mono text-[11px] text-slate-600 truncate block">
                                {String(log.detail || "—")}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: USER SESSIONS & ACTIVITY */}
      {activeTab === "sessions" && (
        <div className="space-y-4">
          <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base font-extrabold text-[#1E3A5F]">Active &amp; Historical User Sessions</h3>
                <p className="text-xs text-slate-500">
                  Track employee logins, idle inactivity timeouts, and session durations for pharmacy accountability.
                </p>
              </div>
              <span className="text-xs font-bold text-teal-800 bg-teal-50 border border-teal-200 px-3 py-1 rounded-full">
                {sessionsList.filter((s) => s.isActive).length} Currently Active
              </span>
            </div>

            {loadingSessions ? (
              <p className="text-center py-12 text-xs text-slate-400 font-medium">Loading session activity...</p>
            ) : sessionsList.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-xs">No user sessions recorded yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-left">
                      <th className="px-4 py-3 font-extrabold text-[#1E3A5F] uppercase tracking-wider">User</th>
                      <th className="px-4 py-3 font-extrabold text-[#1E3A5F] uppercase tracking-wider">Status</th>
                      <th className="px-4 py-3 font-extrabold text-[#1E3A5F] uppercase tracking-wider">Login Time</th>
                      <th className="px-4 py-3 font-extrabold text-[#1E3A5F] uppercase tracking-wider">Last Activity</th>
                      <th className="px-4 py-3 font-extrabold text-[#1E3A5F] uppercase tracking-wider">End Time</th>
                      <th className="px-4 py-3 font-extrabold text-[#1E3A5F] uppercase tracking-wider">Logout Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {sessionsList.map((s) => (
                      <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3">
                          <span className="font-extrabold text-[#1E3A5F] block">{s.userName || `User #${s.userId}`}</span>
                          <span className="text-[10px] text-slate-400 font-mono">ID: {s.userId}</span>
                        </td>

                        <td className="px-4 py-3">
                          {s.isActive ? (
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-100 text-emerald-900 border border-emerald-300 animate-pulse">
                              🟢 ACTIVE NOW
                            </span>
                          ) : (
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-slate-100 text-slate-600 border border-slate-200">
                              CLOSED
                            </span>
                          )}
                        </td>

                        <td className="px-4 py-3 font-mono text-slate-600 whitespace-nowrap">
                          {new Date(s.loginTime).toLocaleString("en-IN")}
                        </td>

                        <td className="px-4 py-3 font-mono text-slate-600 whitespace-nowrap">
                          {new Date(s.lastActivity).toLocaleString("en-IN")}
                        </td>

                        <td className="px-4 py-3 font-mono text-slate-600 whitespace-nowrap">
                          {s.logoutTime ? new Date(s.logoutTime).toLocaleString("en-IN") : "—"}
                        </td>

                        <td className="px-4 py-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                              s.logoutReason === "timeout"
                                ? "bg-amber-100 text-amber-900 border border-amber-200"
                                : s.logoutReason === "manual"
                                ? "bg-slate-100 text-slate-700 border border-slate-200"
                                : "bg-slate-50 text-slate-500"
                            }`}
                          >
                            {s.logoutReason || (s.isActive ? "In Session" : "Expired")}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* DETAIL INSPECTION MODAL */}
      {selectedDetail && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={() => setSelectedDetail(null)}
        >
          <div
            className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase border ${getActionBadge(
                    selectedDetail.log.action
                  )}`}
                >
                  {selectedDetail.log.action}
                </span>
                <h3 className="text-base font-extrabold text-[#1E3A5F] mt-1">Audit Entry Inspection</h3>
              </div>
              <button
                onClick={() => setSelectedDetail(null)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 text-xs space-y-1">
              <p>
                User: <strong className="text-slate-800">{selectedDetail.log.userName}</strong> (
                {selectedDetail.log.userEmail})
              </p>
              <p>Timestamp: {new Date(selectedDetail.log.timestamp).toLocaleString("en-IN")}</p>
              <p>Module: {selectedDetail.log.entityType || "General"}</p>
            </div>

            <div className="space-y-1">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                Logged Event Details (JSON)
              </span>
              <pre className="p-3.5 rounded-2xl bg-slate-900 text-teal-300 font-mono text-[11px] overflow-x-auto max-h-60">
                {JSON.stringify(selectedDetail.parsed, null, 2)}
              </pre>
            </div>

            <button
              onClick={() => setSelectedDetail(null)}
              className="w-full py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
