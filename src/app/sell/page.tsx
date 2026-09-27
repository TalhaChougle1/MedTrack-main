"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  ShoppingCart,
  Search,
  QrCode,
  Plus,
  Minus,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Receipt,
  Printer,
  X,
  CreditCard,
  Banknote,
  Smartphone,
  Pill,
  User,
  Phone,
  FileText,
  Clock,
  Sparkles,
} from "lucide-react";
import BarcodeScannerModal from "@/components/BarcodeScannerModal";

interface CartItem {
  medicineId: number;
  medicineName: string;
  manufacturer: string;
  schedule: string;
  barcode: string | null;
  unitPrice: number;
  quantity: number;
  maxAvailable: number;
  batchCount: number;
  nearestExpiry: string;
  discountPercent: number;
}

export default function POSBillingPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  // Catalog & Search
  const [medicines, setMedicines] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [catalogLoading, setCatalogLoading] = useState(true);

  // Cart State
  const [cart, setCart] = useState<CartItem[]>([]);
  const [overallDiscount, setOverallDiscount] = useState<number>(0);
  const [patientName, setPatientName] = useState("");
  const [patientPhone, setPatientPhone] = useState("");
  const [doctorName, setDoctorName] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("Cash");

  // Barcode Scanner Modal
  const [scannerOpen, setScannerOpen] = useState(false);

  // Checkout State
  const [checkingOut, setCheckingOut] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [completedSale, setCompletedSale] = useState<any | null>(null);

  // Search input focus ref
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    } else if (status === "authenticated") {
      loadCatalog();
    }
  }, [status, router]);

  // Load medicine catalog with unexpired stock counts
  const loadCatalog = useCallback(async () => {
    setCatalogLoading(true);
    try {
      const res = await fetch("/api/medicines");
      if (res.ok) {
        const data = await res.json();
        setMedicines(data);
      }
    } catch (err) {
      console.error("Failed to load catalog:", err);
    } finally {
      setCatalogLoading(false);
    }
  }, []);

  // Filter medicines by query
  const filteredCatalog = medicines.filter((m) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    return (
      m.name?.toLowerCase().includes(q) ||
      m.manufacturer?.toLowerCase().includes(q) ||
      (m.barcode && m.barcode.toLowerCase().includes(q))
    );
  });

  // Add medicine to cart
  const addToCart = (med: any) => {
    setErrorMsg("");
    if (med.totalStock <= 0) {
      setErrorMsg(`'${med.name}' is currently out of stock.`);
      return;
    }

    setCart((prev) => {
      const existing = prev.find((item) => item.medicineId === med.id);
      if (existing) {
        if (existing.quantity >= med.totalStock) {
          setErrorMsg(`Maximum available stock reached for '${med.name}' (${med.totalStock} units).`);
          return prev;
        }
        return prev.map((item) =>
          item.medicineId === med.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      } else {
        return [
          ...prev,
          {
            medicineId: med.id,
            medicineName: med.name,
            manufacturer: med.manufacturer,
            schedule: med.schedule || "OTC",
            barcode: med.barcode,
            unitPrice: Number(med.unitPrice) || 0,
            quantity: 1,
            maxAvailable: med.totalStock,
            batchCount: med.batchCount || 1,
            nearestExpiry: med.nearestExpiry || "",
            discountPercent: 0,
          },
        ];
      }
    });
  };

  // Update item quantity
  const updateQuantity = (medId: number, newQty: number) => {
    setErrorMsg("");
    if (newQty <= 0) {
      removeFromCart(medId);
      return;
    }
    setCart((prev) =>
      prev.map((item) => {
        if (item.medicineId === medId) {
          if (newQty > item.maxAvailable) {
            setErrorMsg(`Cannot exceed available stock of ${item.maxAvailable} units for ${item.medicineName}.`);
            return item;
          }
          return { ...item, quantity: newQty };
        }
        return item;
      })
    );
  };

  // Remove item
  const removeFromCart = (medId: number) => {
    setCart((prev) => prev.filter((item) => item.medicineId !== medId));
  };

  // Clear cart
  const clearCart = () => {
    setCart([]);
    setErrorMsg("");
  };

  // Calculate bill totals
  const subtotal = cart.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const discountAmount = Math.round((subtotal * (overallDiscount / 100)) * 100) / 100;
  const netTotal = Math.max(0, Math.round((subtotal - discountAmount) * 100) / 100);

  // Barcode scanned callback
  const handleBarcodeScanned = (scannedCode: string) => {
    setScannerOpen(false);
    const match = medicines.find(
      (m) => m.barcode && m.barcode.trim().toLowerCase() === scannedCode.trim().toLowerCase()
    );
    if (match) {
      addToCart(match);
    } else {
      setErrorMsg(`No medicine matching barcode '${scannedCode}' found.`);
    }
  };

  // Handle Complete Sale / Checkout
  const handleCheckout = async () => {
    if (cart.length === 0) {
      setErrorMsg("Your cart is empty. Add medicines to complete a sale.");
      return;
    }

    setCheckingOut(true);
    setErrorMsg("");

    try {
      const payload = {
        items: cart.map((item) => ({
          medicineId: item.medicineId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discountPercent: overallDiscount,
        })),
        patientName: patientName.trim() || undefined,
        patientPhone: patientPhone.trim() || undefined,
        doctorName: doctorName.trim() || undefined,
        paymentMethod,
        overallDiscountPercent: overallDiscount,
      };

      const res = await fetch("/api/sales/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data.error || "Checkout failed.");
      } else {
        setCompletedSale(data);
        setCart([]);
        setPatientName("");
        setPatientPhone("");
        setDoctorName("");
        setOverallDiscount(0);
        loadCatalog();

        // Refresh global listeners
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("medtrack:refresh"));
        }
      }
    } catch {
      setErrorMsg("Network error processing sale. Please check your connection.");
    } finally {
      setCheckingOut(false);
    }
  };

  const handlePrintReceipt = () => {
    window.print();
  };

  return (
    <div className="space-y-6 pb-12">
      {/* POS Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-teal-50 text-teal-800 border border-teal-200">
              FEFO Automatic Order
            </span>
            <span className="text-xs text-slate-400 font-semibold">Terminal #01</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#1E3A5F] tracking-tight mt-1 flex items-center gap-2.5">
            <ShoppingCart className="w-7 h-7 text-teal-600" />
            <span>Point of Sale &amp; Billing</span>
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setScannerOpen(true)}
            className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-[#1E3A5F] text-xs font-extrabold border border-slate-200 flex items-center gap-2 transition-all cursor-pointer shadow-2xs"
          >
            <QrCode className="w-4 h-4 text-teal-600" />
            <span>Scan Barcode</span>
          </button>

          {cart.length > 0 && (
            <button
              onClick={clearCart}
              className="px-3.5 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold border border-rose-200 flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear Cart</span>
            </button>
          )}
        </div>
      </div>

      {/* Global Error Banner */}
      {errorMsg && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-start gap-2.5 animate-in fade-in duration-150">
          <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Main Grid: Left Catalog, Right Billing Cart */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: MEDICINE CATALOG & FAST LOOKUP (7 Cols) */}
        <div className="lg:col-span-7 space-y-4">
          {/* Search Box */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search medicine name, manufacturer, or barcode... (Press Enter)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && filteredCatalog.length > 0) {
                  addToCart(filteredCatalog[0]);
                  setSearchQuery("");
                }
              }}
              className="w-full bg-white border border-slate-200 rounded-2xl pl-11 pr-4 py-3 text-xs sm:text-sm font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 shadow-xs"
            />
          </div>

          {/* Catalog Medicine List */}
          <div className="bg-white rounded-3xl border border-slate-200 p-4 shadow-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 px-1">
              <span className="text-xs font-extrabold text-[#1E3A5F] uppercase tracking-wider">
                Medicine Catalog ({filteredCatalog.length})
              </span>
              <span className="text-[11px] text-slate-400 font-medium">Click + to add to cart</span>
            </div>

            {catalogLoading ? (
              <p className="text-xs text-slate-400 text-center py-12 font-medium">Loading catalog...</p>
            ) : filteredCatalog.length === 0 ? (
              <div className="py-12 text-center space-y-2">
                <Pill className="w-8 h-8 text-slate-300 mx-auto" />
                <p className="text-xs font-bold text-[#1E3A5F]">No matching medicines found.</p>
                <p className="text-[11px] text-slate-400">
                  {searchQuery ? "Try a different search query." : "Register medicines in Inventory first."}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 max-h-[520px] overflow-y-auto pr-1">
                {filteredCatalog.map((med) => {
                  const inCartItem = cart.find((c) => c.medicineId === med.id);
                  const isOutOfStock = Number(med.totalStock) <= 0;

                  return (
                    <div
                      key={med.id}
                      className="py-3 px-2 flex items-center justify-between gap-3 hover:bg-slate-50 rounded-xl transition-colors"
                    >
                      <div className="space-y-0.5 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h4 className="font-extrabold text-[#1E3A5F] text-xs sm:text-sm truncate">
                            {med.name}
                          </h4>
                          <span
                            className={`px-1.5 py-0.2 rounded text-[9px] font-extrabold shrink-0 ${
                              med.schedule === "OTC"
                                ? "bg-teal-50 text-teal-800 border border-teal-200"
                                : "bg-amber-50 text-amber-800 border border-amber-200"
                            }`}
                          >
                            Schedule {med.schedule}
                          </span>
                          {med.barcode && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-slate-100 text-slate-600 border border-slate-200">
                              {med.barcode}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500 font-medium truncate">
                          {med.manufacturer} • Price: <strong className="text-slate-800 font-bold">₹{Number(med.unitPrice).toFixed(2)}</strong>
                        </p>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-right">
                          <span
                            className={`text-sm font-black block ${
                              isOutOfStock ? "text-rose-600" : "text-teal-700"
                            }`}
                          >
                            {med.totalStock}
                          </span>
                          <span className="text-[9px] text-slate-400 font-bold uppercase block">
                            {isOutOfStock ? "Out of Stock" : "Available"}
                          </span>
                        </div>

                        <button
                          onClick={() => addToCart(med)}
                          disabled={isOutOfStock}
                          className={`p-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                            isOutOfStock
                              ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                              : inCartItem
                              ? "bg-teal-600 text-white shadow-xs"
                              : "bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200"
                          }`}
                          title="Add to cart"
                        >
                          <Plus className="w-4 h-4" />
                          {inCartItem && <span className="text-[10px] font-black">{inCartItem.quantity}</span>}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: ACTIVE BILLING CART & CHECKOUT (5 Cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Receipt className="w-4 h-4 text-teal-600" />
                <h3 className="text-sm font-extrabold text-[#1E3A5F] uppercase tracking-wider">
                  Current Sale Bill
                </h3>
              </div>
              <span className="px-2 py-0.5 rounded-full text-xs font-extrabold bg-teal-50 text-teal-800 border border-teal-200">
                {cart.length} Item{cart.length === 1 ? "" : "s"}
              </span>
            </div>

            {/* Cart Items List */}
            {cart.length === 0 ? (
              <div className="py-12 text-center space-y-2 border-2 border-dashed border-slate-200 rounded-2xl">
                <ShoppingCart className="w-8 h-8 text-slate-300 mx-auto" />
                <p className="text-xs font-bold text-slate-600">Cart is empty</p>
                <p className="text-[11px] text-slate-400">Search medicines on the left to add items</p>
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[280px] overflow-y-auto pr-1">
                {cart.map((item) => {
                  const itemSubtotal = item.quantity * item.unitPrice;

                  return (
                    <div
                      key={item.medicineId}
                      className="p-3 rounded-2xl bg-slate-50 border border-slate-200 space-y-2 text-xs"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h4 className="font-extrabold text-[#1E3A5F] truncate">{item.medicineName}</h4>
                          <span className="text-[10px] text-slate-500 font-medium">
                            ₹{item.unitPrice.toFixed(2)} each • Max {item.maxAvailable}u
                          </span>
                        </div>
                        <button
                          onClick={() => removeFromCart(item.medicineId)}
                          className="text-slate-400 hover:text-rose-600 cursor-pointer p-0.5"
                          title="Remove item"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="flex items-center justify-between pt-1 border-t border-slate-200/60">
                        {/* Quantity controls */}
                        <div className="flex items-center gap-1.5 bg-white px-2 py-1 rounded-xl border border-slate-200">
                          <button
                            onClick={() => updateQuantity(item.medicineId, item.quantity - 1)}
                            className="text-slate-500 hover:text-slate-800 cursor-pointer"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <input
                            type="number"
                            min="1"
                            max={item.maxAvailable}
                            value={item.quantity}
                            onChange={(e) => updateQuantity(item.medicineId, parseInt(e.target.value) || 0)}
                            className="w-10 text-center font-bold text-slate-800 bg-transparent focus:outline-none text-xs"
                          />
                          <button
                            onClick={() => updateQuantity(item.medicineId, item.quantity + 1)}
                            className="text-slate-500 hover:text-slate-800 cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Item line total */}
                        <div className="text-right">
                          <span className="font-black text-sm text-[#1E3A5F]">
                            ₹{itemSubtotal.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Bill Discount Presets */}
            {cart.length > 0 && (
              <div className="space-y-1.5 pt-2 border-t border-slate-100 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-500">Bill Discount:</span>
                  <span className="text-[11px] font-bold text-amber-700">{overallDiscount}% Applied</span>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {[0, 5, 10, 15, 20].map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => setOverallDiscount(pct)}
                      className={`px-2.5 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        overallDiscount === pct
                          ? "bg-amber-500 text-slate-950 font-black shadow-xs"
                          : "bg-slate-100 hover:bg-slate-200 text-slate-700"
                      }`}
                    >
                      {pct}%
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Optional Customer Information */}
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2.5 text-xs">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#1E3A5F] block">
                Customer &amp; Prescription (Optional)
              </span>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder="Patient Name"
                  value={patientName}
                  onChange={(e) => setPatientName(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:border-teal-500"
                />
                <input
                  type="text"
                  placeholder="Patient Phone"
                  value={patientPhone}
                  onChange={(e) => setPatientPhone(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:border-teal-500"
                />
              </div>
              <input
                type="text"
                placeholder="Prescribing Doctor Name"
                value={doctorName}
                onChange={(e) => setDoctorName(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:border-teal-500"
              />
            </div>

            {/* Payment Method Selector */}
            <div className="space-y-1.5 text-xs">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 block">
                Payment Method
              </span>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: "Cash", icon: Banknote },
                  { id: "Card", icon: CreditCard },
                  { id: "UPI", icon: Smartphone },
                ].map(({ id, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setPaymentMethod(id)}
                    className={`py-2 px-2 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 border transition-all cursor-pointer ${
                      paymentMethod === id
                        ? "bg-teal-600 text-white border-teal-600 shadow-xs"
                        : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{id}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Bill Financial Summary */}
            <div className="p-4 rounded-2xl bg-teal-50/70 border border-teal-200 space-y-1.5 text-xs">
              <div className="flex items-center justify-between text-slate-600">
                <span>Subtotal ({cart.reduce((s, i) => s + i.quantity, 0)} units):</span>
                <span className="font-semibold">₹{subtotal.toFixed(2)}</span>
              </div>
              {overallDiscount > 0 && (
                <div className="flex items-center justify-between text-amber-800 font-bold">
                  <span>Discount ({overallDiscount}%):</span>
                  <span>-₹{discountAmount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex items-center justify-between pt-2 border-t border-teal-200 text-base font-black text-[#1E3A5F]">
                <span>Net Total:</span>
                <span className="text-xl text-teal-800 font-mono">₹{netTotal.toFixed(2)}</span>
              </div>
            </div>

            {/* Checkout Action Button */}
            <button
              onClick={handleCheckout}
              disabled={checkingOut || cart.length === 0}
              className="w-full py-3.5 rounded-2xl bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-lg shadow-teal-600/20 transition-all transform active:scale-[0.99] cursor-pointer"
            >
              <ShoppingCart className="w-4 h-4 text-teal-200" />
              <span>{checkingOut ? "Processing Sale…" : `Complete Sale (₹${netTotal.toFixed(2)})`}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Barcode Scanner Modal */}
      {scannerOpen && (
        <BarcodeScannerModal
          mode="check"
          onClose={() => setScannerOpen(false)}
          onSelectMode={() => {}}
        />
      )}

      {/* Completed Sale Receipt Modal */}
      {completedSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/70 backdrop-blur-md animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="bg-[#1E3A5F] text-white p-5 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="w-6 h-6 text-teal-400" />
                <div>
                  <h3 className="text-base font-extrabold">Sale Completed!</h3>
                  <p className="text-xs text-teal-200 font-mono">Invoice #{completedSale.invoiceNumber}</p>
                </div>
              </div>
              <button
                onClick={() => setCompletedSale(null)}
                className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Receipt Body */}
            <div className="p-6 overflow-y-auto space-y-4 text-xs font-mono">
              <div className="text-center pb-3 border-b border-dashed border-slate-300">
                <h2 className="text-base font-black text-[#1E3A5F]">Apex MedTrack Pharmacy</h2>
                <p className="text-slate-500 text-[11px]">Official Medical Invoice Receipt</p>
                <p className="text-slate-400 text-[10px] mt-0.5">
                  {new Date(completedSale.timestamp).toLocaleString("en-IN")}
                </p>
              </div>

              {/* Customer info */}
              <div className="space-y-0.5 text-[11px] text-slate-600">
                <p>Patient: <strong className="text-slate-800">{completedSale.patientName}</strong></p>
                {completedSale.doctorName && (
                  <p>Doctor: <strong className="text-slate-800">{completedSale.doctorName}</strong></p>
                )}
                <p>Payment: <strong className="text-slate-800">{completedSale.paymentMethod}</strong></p>
              </div>

              {/* Items table */}
              <div className="border-t border-b border-dashed border-slate-300 py-3 space-y-2">
                {completedSale.items?.map((item: any, idx: number) => (
                  <div key={idx} className="space-y-1">
                    <div className="flex items-start justify-between text-xs font-bold text-slate-800">
                      <span>{item.medicineName} x{item.quantity}</span>
                      <span>₹{Number(item.totalPrice).toFixed(2)}</span>
                    </div>
                    {item.deductions?.map((d: any, dIdx: number) => (
                      <p key={dIdx} className="text-[10px] text-slate-500 pl-2">
                        ↳ Batch #{d.batchNumber} (Exp: {d.expiryDate}) −{d.deductedQuantity}u
                      </p>
                    ))}
                  </div>
                ))}
              </div>

              {/* Financial Totals */}
              <div className="space-y-1 text-right text-xs pt-1">
                <p className="text-slate-500">Subtotal: ₹{completedSale.subtotal?.toFixed(2)}</p>
                {completedSale.discountAmount > 0 && (
                  <p className="text-amber-700 font-bold">
                    Discount: -₹{completedSale.discountAmount?.toFixed(2)}
                  </p>
                )}
                <p className="text-base font-black text-emerald-700 pt-1 border-t border-slate-200">
                  Grand Total: ₹{completedSale.grandTotal?.toFixed(2)}
                </p>
              </div>

              {/* Low stock alerts notice */}
              {completedSale.lowStockAlertMedicines?.length > 0 && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-[11px] flex items-center gap-1.5 font-sans font-medium">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>
                    Low stock email triggered for: {completedSale.lowStockAlertMedicines.join(", ")}
                  </span>
                </div>
              )}
            </div>

            {/* Receipt Modal Footer */}
            <div className="bg-slate-50 border-t border-slate-200 p-4 flex items-center justify-end gap-2.5 shrink-0 print:hidden">
              <button
                onClick={handlePrintReceipt}
                className="px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-extrabold text-xs flex items-center gap-1.5 cursor-pointer shadow-sm"
              >
                <Printer className="w-4 h-4" />
                <span>Print Invoice Receipt</span>
              </button>
              <button
                onClick={() => setCompletedSale(null)}
                className="px-4 py-2.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
