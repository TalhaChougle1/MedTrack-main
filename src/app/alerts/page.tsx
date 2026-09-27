"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Clock,
  Trash2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Info,
  X,
  Mail,
  Settings,
  Send,
} from "lucide-react";

export default function ExpiryAlertsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [alertsList, setAlertsList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<string>("ALL");

  // Email Notification Settings State
  const [alertEmail, setAlertEmail] = useState("");
  const [enableLowStockEmails, setEnableLowStockEmails] = useState(true);
  const [enableIncomingOrderEmails, setEnableIncomingOrderEmails] = useState(true);
  const [emailLogsList, setEmailLogsList] = useState<any[]>([]);
  const [loadingSettings, setLoadingSettings] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsSuccessMsg, setSettingsSuccessMsg] = useState("");
  const [settingsErrorMsg, setSettingsErrorMsg] = useState("");
  const [testEmailLoading, setTestEmailLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  // Wastage write-off modal
  const [wastageModalOpen, setWastageModalOpen] = useState(false);
  const [selectedBatchForWastage, setSelectedBatchForWastage] = useState<any>(null);
  const [wastageQty, setWastageQty] = useState("");
  const [wastageReason, setWastageReason] = useState("expired");
  const [actionLoading, setActionLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    } else if (status === "authenticated") {
      fetchAlerts();
      fetchAlertSettings();
    }
  }, [status, router]);

  useEffect(() => {
    if (wastageModalOpen) {
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
  }, [wastageModalOpen]);

  const fetchAlerts = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/batches/alerts");
      if (res.ok) {
        setAlertsList(await res.json());
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const fetchAlertSettings = async () => {
    setLoadingSettings(true);
    try {
      const res = await fetch("/api/alerts/settings");
      if (res.ok) {
        const data = await res.json();
        if (data.settings) {
          setAlertEmail(data.settings.alertEmail || "");
          setEnableLowStockEmails(Boolean(data.settings.enableLowStockEmails));
          setEnableIncomingOrderEmails(Boolean(data.settings.enableIncomingOrderEmails));
        }
        if (data.logs) {
          setEmailLogsList(data.logs);
        }
      }
    } catch (e) {
      console.error("Failed to fetch alert settings:", e);
    } finally {
      setLoadingSettings(false);
    }
  };

  const handleSaveAlertSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    setSettingsSuccessMsg("");
    setSettingsErrorMsg("");

    try {
      const res = await fetch("/api/alerts/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          alertEmail,
          enableLowStockEmails,
          enableIncomingOrderEmails,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setSettingsErrorMsg(data.error || "Failed to save alert settings.");
      } else {
        setSettingsSuccessMsg("Email alert notification settings saved successfully!");
        fetchAlertSettings();
      }
    } catch (err) {
      setSettingsErrorMsg("Network error saving alert settings.");
    } finally {
      setSavingSettings(false);
    }
  };

  const handleSendTestEmail = async () => {
    setTestEmailLoading(true);
    setSettingsSuccessMsg("");
    setSettingsErrorMsg("");
    try {
      const res = await fetch("/api/alerts/test-email", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setSettingsErrorMsg(data.error || "Test email failed.");
      } else {
        setSettingsSuccessMsg(`✅ Test email sent to ${data.recipient}. Check your inbox (and spam folder).`);
      }
    } catch {
      setSettingsErrorMsg("Network error sending test email.");
    } finally {
      setTestEmailLoading(false);
    }
  };

  const handleResetAlertState = async () => {
    if (!confirm("This will clear the duplicate-suppression log so the next low-stock event sends a fresh email. Continue?")) return;
    setResetLoading(true);
    setSettingsSuccessMsg("");
    setSettingsErrorMsg("");
    try {
      const res = await fetch("/api/alerts/test-email", { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        setSettingsErrorMsg(data.error || "Reset failed.");
      } else {
        setSettingsSuccessMsg("🔄 Alert state reset. The next low-stock event will trigger a fresh email.");
        fetchAlertSettings();
      }
    } catch {
      setSettingsErrorMsg("Network error resetting alert state.");
    } finally {
      setResetLoading(false);
    }
  };

  const handleOpenWastage = (batch: any) => {
    setSelectedBatchForWastage(batch);
    setWastageQty(batch.quantity.toString());
    setWastageReason(batch.level === "expired" ? "expired" : "damaged");
    setErrorMsg("");
    setSuccessMsg("");
    setWastageModalOpen(true);
  };

  const handleConfirmWastage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBatchForWastage) return;

    setActionLoading(true);
    setErrorMsg("");
    setSuccessMsg("");

    try {
      const res = await fetch("/api/wastage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          batchId: selectedBatchForWastage.id,
          quantity: parseInt(wastageQty),
          reason: wastageReason,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data.error || "Failed to log wastage.");
      } else {
        setSuccessMsg(`Successfully written off ${wastageQty} units from Batch ${selectedBatchForWastage.batchNumber}.`);
        setWastageModalOpen(false);
        fetchAlerts();
      }
    } catch (err: any) {
      setErrorMsg("Network error logging wastage.");
    } finally {
      setActionLoading(false);
    }
  };

  // Filter batches
  const filteredAlerts = alertsList.filter((item) => {
    if (activeTab === "ALL") return item.level !== null;
    if (activeTab === "expired") return item.level === "expired";
    if (activeTab === "urgent") return item.level === "urgent";
    if (activeTab === "warning") return item.level === "warning";
    if (activeTab === "notice") return item.level === "notice";
    if (activeTab === "healthy") return item.level === null;
    return true;
  });

  const counts = {
    expired: alertsList.filter((a) => a.level === "expired").length,
    urgent: alertsList.filter((a) => a.level === "urgent").length,
    warning: alertsList.filter((a) => a.level === "warning").length,
    notice: alertsList.filter((a) => a.level === "notice").length,
    healthy: alertsList.filter((a) => a.level === null).length,
  };

  return (
    <div className="space-y-8 pb-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#1E3A5F] tracking-tight flex items-center gap-3">
            <AlertTriangle className="w-8 h-8 text-amber-600" />
            <span>Tiered Expiry Alerts Engine</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 font-medium">
            Real-time shelf life monitor providing specific recommended actions at 60, 30, 7, and 0-day thresholds.
          </p>
        </div>
      </div>

      {/* Notifications */}
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

      {/* Tier Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-slate-200/80">
        {/* All Active Alerts */}
        <button
          onClick={() => setActiveTab("ALL")}
          className={`px-3.5 py-2 rounded-xl text-xs font-extrabold whitespace-nowrap transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === "ALL"
              ? "bg-[#1E3A5F] text-white shadow-xs"
              : "bg-slate-100 hover:bg-slate-200/80 text-slate-600 font-bold"
          }`}
        >
          <span>All Active Alerts</span>
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
              activeTab === "ALL" ? "bg-white/20 text-white" : "bg-slate-200 text-slate-700"
            }`}
          >
            {alertsList.filter((a) => a.level !== null).length}
          </span>
        </button>

        {/* Expired */}
        <button
          onClick={() => setActiveTab("expired")}
          className={`px-3.5 py-2 rounded-xl text-xs font-extrabold whitespace-nowrap transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === "expired"
              ? "bg-rose-600 text-white shadow-xs"
              : "bg-rose-50 hover:bg-rose-100/80 text-rose-700 font-bold"
          }`}
        >
          <XCircle className={`w-4 h-4 ${activeTab === "expired" ? "text-white" : "text-rose-600"}`} />
          <span>Expired</span>
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
              activeTab === "expired" ? "bg-white/20 text-white" : "bg-rose-200/80 text-rose-800"
            }`}
          >
            {counts.expired}
          </span>
        </button>

        {/* Urgent */}
        <button
          onClick={() => setActiveTab("urgent")}
          className={`px-3.5 py-2 rounded-xl text-xs font-extrabold whitespace-nowrap transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === "urgent"
              ? "bg-rose-600 text-white shadow-xs"
              : "bg-rose-50 hover:bg-rose-100/80 text-rose-700 font-bold"
          }`}
        >
          <AlertCircle className={`w-4 h-4 ${activeTab === "urgent" ? "text-white" : "text-rose-600"}`} />
          <span>1–7 Days Urgent</span>
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
              activeTab === "urgent" ? "bg-white/20 text-white" : "bg-rose-200/80 text-rose-800"
            }`}
          >
            {counts.urgent}
          </span>
        </button>

        {/* Warning */}
        <button
          onClick={() => setActiveTab("warning")}
          className={`px-3.5 py-2 rounded-xl text-xs font-extrabold whitespace-nowrap transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === "warning"
              ? "bg-yellow-400 text-slate-950 font-black shadow-xs"
              : "bg-yellow-50 hover:bg-yellow-100/80 text-yellow-800 font-bold"
          }`}
        >
          <Clock className={`w-4 h-4 ${activeTab === "warning" ? "text-slate-950" : "text-yellow-600"}`} />
          <span>8–30 Days Warning</span>
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
              activeTab === "warning" ? "bg-slate-950/20 text-slate-950" : "bg-yellow-200/80 text-yellow-900"
            }`}
          >
            {counts.warning}
          </span>
        </button>

        {/* Notice */}
        <button
          onClick={() => setActiveTab("notice")}
          className={`px-3.5 py-2 rounded-xl text-xs font-extrabold whitespace-nowrap transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === "notice"
              ? "bg-teal-600 text-white shadow-xs"
              : "bg-teal-50 hover:bg-teal-100/80 text-teal-800 font-bold"
          }`}
        >
          <Info className={`w-4 h-4 ${activeTab === "notice" ? "text-white" : "text-teal-600"}`} />
          <span>31–60 Days Notice</span>
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
              activeTab === "notice" ? "bg-white/20 text-white" : "bg-teal-200/80 text-teal-900"
            }`}
          >
            {counts.notice}
          </span>
        </button>

        {/* Email Notification Settings & Logs */}
        <button
          onClick={() => setActiveTab("email-settings")}
          className={`px-3.5 py-2 rounded-xl text-xs font-extrabold whitespace-nowrap transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === "email-settings"
              ? "bg-[#1BA6C4] text-white shadow-xs"
              : "bg-cyan-50 hover:bg-cyan-100/80 text-[#1BA6C4] font-bold"
          }`}
        >
          <Mail className={`w-4 h-4 ${activeTab === "email-settings" ? "text-white" : "text-[#1BA6C4]"}`} />
          <span>Email Alert Settings & Logs</span>
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
              activeTab === "email-settings" ? "bg-white/20 text-white" : "bg-cyan-200 text-cyan-900"
            }`}
          >
            {emailLogsList.filter((l) => l.status !== "RECOVERY").length}
          </span>
        </button>
      </div>

      {/* EMAIL SETTINGS & LOGS TAB CONTENT */}
      {activeTab === "email-settings" && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Email Settings Configuration Card */}
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-5">
            <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
              <div className="w-10 h-10 rounded-2xl bg-cyan-50 text-[#1BA6C4] flex items-center justify-center font-bold">
                <Settings className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-[#1E3A5F]">Custom Email Alert Configuration</h3>
                <p className="text-xs text-slate-500">
                  Configure automated email notifications for low medicine stock and incoming stock order updates.
                </p>
              </div>
            </div>

            {settingsErrorMsg && (
              <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
                <span>{settingsErrorMsg}</span>
              </div>
            )}

            {settingsSuccessMsg && (
              <div className="p-3.5 rounded-2xl bg-teal-50 border border-teal-200 text-teal-800 text-xs font-semibold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0" />
                <span>{settingsSuccessMsg}</span>
              </div>
            )}

            <form onSubmit={handleSaveAlertSettings} className="space-y-5">
              <div>
                <label className="block text-xs font-bold text-[#1E3A5F] uppercase tracking-wider mb-1.5">
                  Medical Staff Alert Email Address *
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    value={alertEmail}
                    onChange={(e) => setAlertEmail(e.target.value)}
                    placeholder="e.g. staff@pharmacy.com"
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-10 pr-4 py-3 text-xs font-semibold text-slate-800 focus:outline-none focus:border-cyan-600 shadow-2xs"
                  />
                </div>
                <span className="text-[11px] text-slate-500 mt-1 block">
                  Automated inventory stock notifications and order confirmations will be sent to this email address.
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="flex items-start gap-3 p-4 rounded-2xl bg-slate-50 border border-slate-200 cursor-pointer hover:border-cyan-300 transition-colors">
                  <input
                    type="checkbox"
                    checked={enableLowStockEmails}
                    onChange={(e) => setEnableLowStockEmails(e.target.checked)}
                    className="mt-0.5 w-4 h-4 text-cyan-600 rounded-md focus:ring-cyan-500"
                  />
                  <div>
                    <span className="text-xs font-extrabold text-[#1E3A5F] block">
                      Low Medicine Stock Email Alerts
                    </span>
                    <span className="text-[11px] text-slate-500 font-medium">
                      Trigger automated email alerts whenever a medicine&apos;s stock drops to or below its configured low-stock threshold.
                    </span>
                    <span className="text-[11px] text-cyan-700 font-semibold block mt-1">
                      ℹ Configure the stock threshold for each medicine individually from the Medicine Inventory page.
                    </span>
                  </div>
                </label>

                <label className="flex items-start gap-3 p-4 rounded-2xl bg-slate-50 border border-slate-200 cursor-pointer hover:border-cyan-300 transition-colors">
                  <input
                    type="checkbox"
                    checked={enableIncomingOrderEmails}
                    onChange={(e) => setEnableIncomingOrderEmails(e.target.checked)}
                    className="mt-0.5 w-4 h-4 text-cyan-600 rounded-md focus:ring-cyan-500"
                  />
                  <div>
                    <span className="text-xs font-extrabold text-[#1E3A5F] block">
                      Incoming Stock Order Email Alerts
                    </span>
                    <span className="text-[11px] text-slate-500 font-medium">
                      Receive email confirmation &amp; arrival alerts when medical staff orders new incoming medicine stock.
                    </span>
                  </div>
                </label>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="submit"
                  disabled={savingSettings}
                  className="px-6 py-3 rounded-2xl bg-[#1BA6C4] hover:bg-[#158fa9] text-white font-extrabold text-xs shadow-md transition-all cursor-pointer flex items-center gap-2"
                >
                  <Send className="w-4 h-4" />
                  <span>{savingSettings ? "Saving…" : "Save Alert Settings"}</span>
                </button>

                <button
                  type="button"
                  disabled={testEmailLoading || !alertEmail}
                  onClick={handleSendTestEmail}
                  className="px-5 py-3 rounded-2xl bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-extrabold text-xs shadow-md transition-all cursor-pointer flex items-center gap-2"
                  title="Send a real Brevo test email to the address above to verify delivery"
                >
                  <Mail className="w-4 h-4" />
                  <span>{testEmailLoading ? "Sending…" : "Send Test Email"}</span>
                </button>

                <button
                  type="button"
                  disabled={resetLoading}
                  onClick={handleResetAlertState}
                  className="px-5 py-3 rounded-2xl bg-slate-100 hover:bg-amber-50 border border-slate-200 hover:border-amber-300 disabled:opacity-50 text-slate-700 hover:text-amber-800 font-extrabold text-xs transition-all cursor-pointer flex items-center gap-2"
                  title="Clear duplicate-suppression state so the next low-stock event triggers a fresh email (use after changing recipient)"
                >
                  <Settings className="w-4 h-4" />
                  <span>{resetLoading ? "Resetting…" : "Reset Alert State"}</span>
                </button>
              </div>
            </form>
          </div>

          {/* Dispatched Email Alert Logs */}
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-extrabold text-[#1E3A5F]">Dispatched Email Alert Logs</h3>
              <span className="text-xs text-slate-500 font-medium">
                {emailLogsList.filter((l) => l.status !== "RECOVERY").length} Dispatched Alerts Logged
              </span>
            </div>

            {emailLogsList.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-xs font-medium">
                No email alert logs dispatched yet. Email alerts will appear here automatically when medicine stock drops or incoming orders are placed.
              </div>
            ) : (
              <div className="space-y-3">
                {emailLogsList.filter((l) => l.status !== "RECOVERY").map((log) => (
                  <div
                    key={log.id}
                    className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                            log.alertType === "LOW_STOCK"
                              ? "bg-amber-100 text-amber-800 border border-amber-200"
                              : "bg-cyan-100 text-cyan-800 border border-cyan-200"
                          }`}
                        >
                          {log.alertType === "LOW_STOCK" ? "Low Stock Alert" : "Incoming Order"}
                        </span>
                        <span className="font-extrabold text-[#1E3A5F]">{log.subject}</span>
                      </div>
                      <p className="text-slate-500 text-[11px]">
                        Recipient: <span className="font-mono text-slate-700">{log.recipientEmail}</span>
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <span
                        className={`px-2 py-1 rounded-xl font-extrabold text-[10px] ${
                          log.status === "SENT"
                            ? "bg-emerald-100 text-emerald-800"
                            : log.status === "FAILED"
                            ? "bg-rose-100 text-rose-800"
                            : log.status === "RECOVERY"
                            ? "bg-teal-100 text-teal-800"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {log.status}
                      </span>
                      <span className="block text-[10px] text-slate-400 mt-1">
                        {new Date(log.timestamp).toLocaleString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Alert Cards Grid */}
      {loading ? (
        <p className="text-center py-10 text-slate-500 text-xs font-bold">Calculating fresh alert levels...</p>
      ) : filteredAlerts.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center space-y-3 shadow-xs">
          <CheckCircle2 className="w-10 h-10 text-teal-600 mx-auto" />
          <h3 className="text-base font-extrabold text-[#1E3A5F]">No Batches in Selected Alert Category</h3>
          <p className="text-xs text-slate-500 font-medium">Your inventory has zero items under this specific alert filter.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredAlerts.map((batch) => {
            const isExpired = batch.level === "expired";
            const isUrgent = batch.level === "urgent";
            const isWarning = batch.level === "warning";
            const isNotice = batch.level === "notice";

            return (
              <div
                key={batch.id}
                className={`p-5 rounded-3xl border flex flex-col justify-between gap-4 transition-all shadow-xs ${
                  isExpired
                    ? "bg-rose-50 border-rose-200"
                    : isUrgent
                    ? "bg-rose-50 border-rose-200"
                    : isWarning
                    ? "bg-yellow-50 border-yellow-200"
                    : isNotice
                    ? "bg-teal-50 border-teal-200"
                    : "bg-white border-slate-200"
                }`}
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-[10px] font-extrabold uppercase tracking-widest px-2 py-0.5 rounded bg-slate-200 text-slate-800">
                        Schedule {batch.medicineSchedule}
                      </span>
                      <h3 className="text-base font-extrabold text-[#1E3A5F] mt-1">{batch.medicineName}</h3>
                      <p className="text-xs text-slate-500 font-medium">Manufacturer: {batch.manufacturer}</p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {batch.isWastageLogged && (
                        <span className="px-2.5 py-1 rounded-full text-xs font-extrabold bg-emerald-100 text-emerald-900 border border-emerald-300 flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          <span>✓ LOGGED</span>
                        </span>
                      )}
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider ${
                          isExpired
                            ? "bg-rose-600 text-white"
                            : isUrgent
                            ? "bg-rose-600 text-white"
                            : isWarning
                            ? "bg-yellow-400 text-slate-950"
                            : isNotice
                            ? "bg-teal-600 text-white"
                            : "bg-emerald-600 text-white"
                        }`}
                      >
                        {isExpired ? "EXPIRED" : `${batch.daysLeft} Days Left`}
                      </span>
                    </div>
                  </div>

                  {/* Details */}
                  <div className="grid grid-cols-2 gap-2 text-xs py-2 px-3 rounded-2xl bg-white border border-slate-200 font-medium shadow-2xs">
                    <div>
                      <span className="text-[10px] text-slate-500 uppercase block font-bold">Batch Number</span>
                      <span className="font-mono font-bold text-[#1E3A5F]">{batch.batchNumber}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 uppercase block font-bold">Remaining Stock</span>
                      <span className={`font-bold ${batch.quantity === 0 ? "text-slate-400 line-through" : "text-slate-800"}`}>
                        {batch.quantity} Units
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 uppercase block font-bold">Expiry Date</span>
                      <span className="font-bold text-amber-700">{batch.expiryDate}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 uppercase block font-bold">Supplier</span>
                      <span className="text-slate-700 truncate block font-medium">{batch.supplier}</span>
                    </div>
                  </div>

                  {/* Recommended Action Banner */}
                  <div className={`p-3 rounded-2xl text-xs space-y-1 ${
                    batch.isWastageLogged
                      ? "bg-emerald-50 border border-emerald-200 text-emerald-900"
                      : "bg-white border border-slate-200"
                  }`}>
                    <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest block">
                      Recommended Action
                    </span>
                    <p className="font-bold text-[#1E3A5F]">{batch.action}</p>
                  </div>
                </div>

                {/* Card Action Button */}
                <div className="pt-2 border-t border-slate-200 flex items-center justify-between">
                  <span className="text-[11px] text-slate-500 font-bold">Unit Price: ₹{batch.costPrice}</span>
                  {batch.isWastageLogged ? (
                    <button
                      disabled
                      className="px-3.5 py-1.5 rounded-xl bg-emerald-100 text-emerald-900 border border-emerald-300 text-xs font-black flex items-center gap-1.5 shadow-2xs opacity-90 cursor-default"
                    >
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>✓ Wastage Logged</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => handleOpenWastage(batch)}
                      className="px-3.5 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Log Wastage</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal: Confirm Wastage Write-Off */}
      {wastageModalOpen && selectedBatchForWastage && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-md p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-base font-extrabold text-[#1E3A5F]">Log Wastage Write-Off</h3>
                <p className="text-xs text-rose-700 font-extrabold">{selectedBatchForWastage.medicineName}</p>
              </div>
              <button onClick={() => setWastageModalOpen(false)} className="text-slate-400 hover:text-slate-700 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmWastage} className="space-y-4 text-xs">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 font-mono text-slate-700">
                <p>Batch: {selectedBatchForWastage.batchNumber}</p>
                <p>Current Quantity: {selectedBatchForWastage.quantity} units</p>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Units to Write Off *</label>
                <input
                  type="number"
                  required
                  min="1"
                  max={selectedBatchForWastage.quantity}
                  value={wastageQty}
                  onChange={(e) => setWastageQty(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-slate-800 focus:border-rose-500 font-bold"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Reason for Wastage *</label>
                <select
                  value={wastageReason}
                  onChange={(e) => setWastageReason(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-slate-800 focus:border-rose-500 font-semibold"
                >
                  <option value="expired">Expired Stock</option>
                  <option value="damaged">Damaged Box / Strip</option>
                  <option value="contaminated">Contaminated / Broken Seal</option>
                  <option value="recalled">Government Drug Recall</option>
                  <option value="other">Other Wastage Reason</option>
                </select>
              </div>

              <button
                type="submit"
                disabled={actionLoading}
                className="w-full py-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-md cursor-pointer"
              >
                Confirm Stock Write-Off
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
