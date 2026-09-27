"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  Users,
  Search,
  FileText,
  Printer,
  Calendar,
  DollarSign,
  Pill,
  X,
  UserCheck,
  Building2,
  Phone,
  Clock,
  ArrowRight,
} from "lucide-react";

export default function PatientRecordsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [patientsList, setPatientsList] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);

  // Selected patient for viewing invoices
  const [selectedPatient, setSelectedPatient] = useState<any | null>(null);
  const [patientInvoices, setPatientInvoices] = useState<any[]>([]);
  const [shopInfo, setShopInfo] = useState<any | null>(null);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [invoiceModalOpen, setInvoiceModalOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<any | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    } else if (status === "authenticated") {
      fetchPatients();
    }
  }, [status, router]);

  useEffect(() => {
    const handleRefresh = () => {
      fetchPatients(searchQuery);
    };
    window.addEventListener("medtrack:refresh", handleRefresh);
    return () => {
      window.removeEventListener("medtrack:refresh", handleRefresh);
    };
  }, [searchQuery]);

  useEffect(() => {
    if (invoiceModalOpen) {
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
  }, [invoiceModalOpen]);

  const fetchPatients = async (query = "") => {
    setLoading(true);
    try {
      const res = await fetch(`/api/patients?q=${encodeURIComponent(query)}`);
      if (res.ok) {
        setPatientsList(await res.json());
      }
    } catch (e) {
      console.error("Failed to fetch patients:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchPatients(searchQuery);
  };

  const handleOpenPatientInvoices = async (patient: any) => {
    setSelectedPatient(patient);
    setSelectedInvoice(null);
    setLoadingInvoices(true);
    setInvoiceModalOpen(true);

    try {
      const res = await fetch(`/api/patients/${patient.id}/invoices`);
      if (res.ok) {
        const data = await res.json();
        setPatientInvoices(data.invoices || []);
        setShopInfo(data.shop || null);
      }
    } catch (e) {
      console.error("Failed to load patient invoices:", e);
    } finally {
      setLoadingInvoices(false);
    }
  };

  const handlePrintInvoice = () => {
    window.print();
  };

  return (
    <div className="min-h-screen bg-slate-50 text-[#1A2B3C] pb-16">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-[#1E3A5F] via-[#1E3A5F]/95 to-[#1BA6C4] text-white py-10 px-4 sm:px-8 shadow-md">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center text-teal-300">
                <Users className="w-6 h-6" />
              </div>
              <div>
                <span className="text-xs uppercase tracking-widest text-teal-300 font-bold">
                  Medical Staff Registry
                </span>
                <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                  Patient Records & Past Invoices
                </h1>
              </div>
            </div>
            <p className="text-slate-200 text-xs sm:text-sm max-w-2xl">
              Search registered patients, review past medicine purchase history, and re-issue or print official medical invoices anytime.
            </p>
          </div>

          <form onSubmit={handleSearch} className="w-full md:w-auto flex items-center gap-2">
            <div className="relative flex-1 md:w-80">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search patient by name..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  if (!e.target.value.trim()) fetchPatients("");
                }}
                className="w-full bg-white/10 border border-white/20 rounded-2xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-300 focus:outline-none focus:bg-white/20 transition-all"
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2.5 rounded-2xl bg-[#1BA6C4] hover:bg-[#158fa9] text-white font-extrabold text-xs shadow-md transition-all cursor-pointer whitespace-nowrap"
            >
              Search
            </button>
          </form>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8 space-y-6">
        {/* Patient Stats Card Row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center font-bold">
              <UserCheck className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs text-slate-400 font-bold uppercase block">Total Registered Patients</span>
              <span className="text-2xl font-black text-[#1E3A5F]">{patientsList.length}</span>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-cyan-50 text-[#1BA6C4] flex items-center justify-center font-bold">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs text-slate-400 font-bold uppercase block">Total Dispensed Invoices</span>
              <span className="text-2xl font-black text-[#1E3A5F]">
                {patientsList.reduce((sum, p) => sum + (p.totalOrders || 0), 0)}
              </span>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
              <DollarSign className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs text-slate-400 font-bold uppercase block">Patient Revenue Total</span>
              <span className="text-2xl font-black text-emerald-700">
                ₹{patientsList.reduce((sum, p) => sum + (p.totalSpent || 0), 0).toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        {/* Patient Records Grid */}
        {loading ? (
          <div className="py-20 text-center text-slate-400 text-xs font-bold animate-pulse">
            Loading patient records database...
          </div>
        ) : patientsList.length === 0 ? (
          <div className="bg-white rounded-3xl p-8 sm:p-12 text-center border border-slate-200 space-y-5 max-w-2xl mx-auto shadow-xs">
            <div className="w-16 h-16 rounded-3xl bg-teal-50 border border-teal-200 flex items-center justify-center mx-auto text-teal-700">
              <Users className="w-8 h-8" />
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-extrabold text-[#1E3A5F]">No Patient Records Found</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto font-medium">
                To record a patient purchase, make sure you have added a medicine with an active unexpired batch, then type the patient's name when dispensing.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-left text-xs space-y-2.5 max-w-md mx-auto">
              <p className="font-extrabold text-[#1E3A5F] uppercase tracking-wider text-[11px]">
                📋 How to record your first patient purchase:
              </p>
              <ol className="list-decimal list-inside space-y-1.5 text-slate-600 font-medium">
                <li>Go to <strong className="text-slate-800">Inventory</strong> and make sure a medicine has stock (or click <em>Add Batch</em> to add stock).</li>
                <li>Click <strong className="text-teal-700">Dispense</strong> on the medicine.</li>
                <li>In Step 2 of the pop-up, enter the <strong className="text-slate-800">Patient's Name</strong> (e.g. <em>Rahul Sharma</em>).</li>
                <li>Click <strong className="text-slate-800">Complete Dispense</strong> — patient records & invoices will appear here automatically!</li>
              </ol>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <button
                onClick={() => router.push("/inventory")}
                className="w-full sm:w-auto px-5 py-2.5 rounded-2xl bg-[#1E3A5F] hover:bg-[#152a45] text-white font-extrabold text-xs flex items-center justify-center gap-2 shadow-xs cursor-pointer transition-all"
              >
                <Pill className="w-4 h-4 text-teal-300" />
                <span>Go to Inventory to Stock Medicines</span>
              </button>
              <button
                onClick={() => router.push("/sell")}
                className="w-full sm:w-auto px-5 py-2.5 rounded-2xl bg-teal-600 hover:bg-teal-700 text-white font-extrabold text-xs flex items-center justify-center gap-2 shadow-xs cursor-pointer transition-all"
              >
                <span>Go to FEFO Dispense POS</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {patientsList.map((patient) => (
              <div
                key={patient.id}
                className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs hover:shadow-md transition-all flex flex-col justify-between space-y-4 group"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-2xl bg-teal-50 border border-teal-200 text-teal-800 font-black text-base flex items-center justify-center">
                        {patient.name[0]?.toUpperCase()}
                      </div>
                      <div>
                        <h3 className="font-extrabold text-[#1E3A5F] text-base group-hover:text-[#1BA6C4] transition-colors">
                          {patient.name}
                        </h3>
                        <span className="text-[11px] font-semibold text-slate-400">
                          Registered: {new Date(patient.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 p-3 rounded-2xl border border-slate-100">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Past Purchases</span>
                      <span className="font-extrabold text-slate-800">{patient.totalOrders} Orders</span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Total Spent</span>
                      <span className="font-extrabold text-emerald-700">₹{patient.totalSpent}</span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => handleOpenPatientInvoices(patient)}
                  className="w-full py-2.5 rounded-2xl bg-[#1E3A5F] hover:bg-[#152a45] text-white font-extrabold text-xs flex items-center justify-center gap-2 shadow-xs transition-all cursor-pointer"
                >
                  <FileText className="w-3.5 h-3.5 text-teal-300" />
                  <span>View Past Invoices ({patient.totalOrders})</span>
                  <ArrowRight className="w-3.5 h-3.5 opacity-60" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Patient Invoices Modal */}
      {invoiceModalOpen && selectedPatient && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/70 backdrop-blur-md animate-in fade-in duration-200"
          onClick={() => setInvoiceModalOpen(false)}
        >
          <div
            className="relative w-full max-w-4xl bg-white rounded-3xl shadow-2xl border border-slate-200 flex flex-col max-h-[90vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="bg-[#1E3A5F] text-white px-6 py-4 flex items-center justify-between shrink-0 shadow-md">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-teal-500/20 border border-teal-400/30 flex items-center justify-center text-teal-300">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-extrabold">{selectedPatient.name} — Past Invoices</h2>
                  <p className="text-xs text-teal-200">
                    Registered Patient ID #{selectedPatient.id} • {patientInvoices.length} Total Dispense Records
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handlePrintInvoice}
                  className="px-3.5 py-1.5 rounded-xl bg-teal-500 hover:bg-teal-600 text-white font-extrabold text-xs flex items-center gap-1.5 transition-all cursor-pointer print:hidden"
                  title="Print Patient Invoices"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print Invoices</span>
                </button>

                <button
                  onClick={() => setInvoiceModalOpen(false)}
                  className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer print:hidden"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Body / Invoice List */}
            <div className="p-6 overflow-y-auto space-y-6">
              {loadingInvoices ? (
                <div className="py-12 text-center text-slate-400 text-xs font-bold animate-pulse">
                  Loading patient invoice history...
                </div>
              ) : patientInvoices.length === 0 ? (
                <div className="py-12 text-center text-slate-500 text-xs">
                  No past medicine purchase records found for {selectedPatient.name}.
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Shop Info Header for Printing */}
                  {shopInfo && (
                    <div className="hidden print:block p-4 border-b border-slate-300 text-slate-900 mb-4">
                      <h2 className="text-xl font-extrabold">{shopInfo.name}</h2>
                      <p className="text-xs">{shopInfo.address || "Pharmacy Store"}</p>
                      <p className="text-xs">Phone: {shopInfo.phone} | Reg/License: {shopInfo.licenseNumber || "N/A"}</p>
                    </div>
                  )}

                  {patientInvoices.map((inv, idx) => (
                    <div
                      key={inv.id || idx}
                      className="bg-slate-50 rounded-2xl border border-slate-200 p-5 space-y-4 shadow-2xs hover:border-teal-300 transition-colors"
                    >
                      {/* Invoice Top Details */}
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs pb-3 border-b border-slate-200">
                        <div>
                          <span className="font-mono font-extrabold text-[#1E3A5F] text-sm">
                            Invoice #{inv.id ? `INV-${1000 + inv.id}` : `TX-${idx + 1}`}
                          </span>
                          <span className="text-slate-500 font-semibold block text-[11px]">
                            Dispensed on {new Date(inv.createdAt).toLocaleString()}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-xs text-slate-400 font-bold block uppercase">Bill Amount</span>
                          <span className="text-lg font-black text-emerald-700 font-mono">
                            ₹{inv.totalPrice?.toFixed(2)}
                          </span>
                        </div>
                      </div>

                      {/* Medicine Breakdown */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs bg-white p-3.5 rounded-xl border border-slate-200">
                        <div>
                          <span className="text-slate-400 text-[10px] font-bold block uppercase">Medicine</span>
                          <span className="font-extrabold text-slate-800">{inv.medicineName}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 text-[10px] font-bold block uppercase">Quantity & Price</span>
                          <span className="font-semibold text-slate-700">
                            {inv.quantity} units @ ₹{inv.unitPrice} / unit
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400 text-[10px] font-bold block uppercase">Discount</span>
                          <span className="font-semibold text-amber-700">
                            {inv.discountPercent || 0}% (-₹{inv.discountAmount || 0})
                          </span>
                        </div>
                      </div>

                      {/* Optional Prescribing Doctor */}
                      {inv.doctorName && (
                        <div className="text-xs bg-cyan-50/70 p-2.5 rounded-xl border border-cyan-200 flex items-center gap-2">
                          <span className="text-cyan-800 font-bold text-[10px] uppercase">Prescribing Doctor:</span>
                          <span className="font-extrabold text-slate-800">{inv.doctorName}</span>
                        </div>
                      )}

                      {/* Deducted Batch Information */}
                      {inv.parsedBatchDetails && inv.parsedBatchDetails.length > 0 && (
                        <div className="space-y-1">
                          <span className="text-[10px] uppercase font-bold text-slate-400 block">
                            Dispensed Batch Trace:
                          </span>
                          <div className="flex flex-wrap gap-2 text-[11px] font-mono">
                            {inv.parsedBatchDetails.map((b: any, bIdx: number) => (
                              <span
                                key={bIdx}
                                className="px-2 py-1 rounded-lg bg-white border border-slate-200 text-slate-700"
                              >
                                Batch #{b.batchNumber} (Exp: {b.expiryDate}) — {b.deductedQuantity} units
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="bg-slate-50 border-t border-slate-200 px-6 py-4 flex items-center justify-between shrink-0 print:hidden">
              <span className="text-xs text-slate-500 font-medium">
                Official medical dispensing invoices stored securely for {selectedPatient.name}
              </span>
              <button
                onClick={() => setInvoiceModalOpen(false)}
                className="px-5 py-2.5 rounded-2xl bg-slate-200 hover:bg-slate-300 text-slate-700 font-extrabold text-xs cursor-pointer transition-colors"
              >
                Close Window
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
