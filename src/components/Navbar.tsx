"use client";

import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Pill,
  LayoutDashboard,
  Boxes,
  AlertTriangle,
  RefreshCw,
  LogOut,
  Menu,
  X,
  Building2,
  QrCode,
  Users,
  BarChart2,
  ShoppingCart,
  ShieldCheck,
} from "lucide-react";
import BarcodeScannerModal from "./BarcodeScannerModal";

export default function Navbar() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerMode, setScannerMode] = useState<"check" | "stockIn">("check");

  if (!session || pathname === "/login" || pathname === "/register") return null;

  const navItems = [
    { label: "Dashboard",              shortLabel: "Dashboard", href: "/",          icon: LayoutDashboard },
    { label: "Billing & POS",          shortLabel: "Billing",   href: "/sell",      icon: ShoppingCart },
    { label: "Inventory & Batches",    shortLabel: "Inventory", href: "/inventory", icon: Boxes },
    { label: "Patient Records",        shortLabel: "Patients",  href: "/patients",  icon: Users },
    { label: "Expiry Alerts",          shortLabel: "Alerts",    href: "/alerts",    icon: AlertTriangle },
    { label: "Restock",                shortLabel: "Restock",   href: "/restock",   icon: RefreshCw },
    { label: "Reports",                shortLabel: "Reports",   href: "/reports",   icon: BarChart2 },
    { label: "Audit & Sessions",       shortLabel: "Audit",     href: "/audit",     icon: ShieldCheck },
  ];

  const handleOpenScanner = (mode: "check" | "stockIn") => {
    setScannerMode(mode);
    setScannerOpen(true);
    setMobileMenuOpen(false);
  };

  return (
    <>
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200 text-[#1A2B3C] shadow-xs w-full">
        {/* Top Tier: Logo & Main Actions */}
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 border-b border-slate-100 min-w-0">
          <div className="flex items-center justify-between h-14 gap-2 sm:gap-4 min-w-0">
            {/* Brand Logo */}
            <Link href="/" className="flex items-center gap-2.5 group shrink-0 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-cyan-gradient flex items-center justify-center text-white font-black shadow-md shadow-[#29C5E0]/30 group-hover:scale-105 transition-transform shrink-0">
                <Pill className="w-4 h-4 text-white" />
              </div>
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-base sm:text-lg font-extrabold tracking-tight text-[#1A2B3C] truncate">
                  MedTrack
                </span>
                <span className="hidden lg:inline-flex items-center text-[9px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-cyan-50 text-[#1BA6C4] font-extrabold border border-cyan-200 shrink-0">
                  FEFO ENABLED
                </span>
              </div>
            </Link>

            {/* Desktop Action Bar */}
            <div className="hidden md:flex items-center gap-2 lg:gap-3 shrink-0 min-w-0">
              {/* New Sale Button */}
              <Link
                href="/sell"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-extrabold bg-teal-600 hover:bg-teal-700 text-white shadow-xs hover:shadow-md transition-all cursor-pointer whitespace-nowrap"
                title="Open Point of Sale Billing Terminal"
              >
                <ShoppingCart className="w-3.5 h-3.5 text-white" />
                <span>New Sale</span>
              </Link>

              {/* Barcode Scanner: Check / Stock In */}
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 shrink-0">
                <button
                  onClick={() => handleOpenScanner("check")}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold text-[#1A2B3C] hover:bg-white transition-all cursor-pointer whitespace-nowrap"
                  title="Scan barcode to check stock & expiry"
                >
                  <QrCode className="w-3.5 h-3.5 text-[#1BA6C4]" />
                  <span>Check</span>
                </button>
                <button
                  onClick={() => handleOpenScanner("stockIn")}
                  className="flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-extrabold btn-primary-cyan shadow-xs hover:shadow-md transition-all cursor-pointer whitespace-nowrap"
                  title="Scan delivery barcode to stock in new batch"
                >
                  <Boxes className="w-3.5 h-3.5 text-white" />
                  <span>Stock In</span>
                </button>
              </div>

              {/* User Profile */}
              <div className="flex items-center gap-2 pl-2.5 border-l border-slate-200 shrink-0 min-w-0">
                <div className="text-right text-xs truncate max-w-[140px] lg:max-w-none">
                  <p className="font-extrabold text-[#1A2B3C] leading-tight truncate">{session.user.name}</p>
                  <div className="flex items-center justify-end gap-1 text-[10px] text-slate-500 font-medium mt-0.5">
                    <Building2 className="w-3 h-3 text-slate-400 shrink-0" />
                    <span className="capitalize text-[#1BA6C4] font-extrabold whitespace-nowrap">Shop #{session.user.shopId}</span>
                  </div>
                </div>
                <button
                  onClick={() => signOut({ callbackUrl: "/login" })}
                  className="p-1.5 rounded-xl bg-slate-100 hover:bg-rose-50 text-slate-500 hover:text-rose-600 transition-colors border border-slate-200 cursor-pointer shrink-0"
                  title="Log out"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Mobile Action Buttons */}
            <div className="flex md:hidden items-center gap-1 sm:gap-1.5 shrink-0">
              <button
                onClick={() => handleOpenScanner("check")}
                className="px-2 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-[#1E3A5F] border border-slate-200 text-xs font-extrabold flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
              >
                <QrCode className="w-3.5 h-3.5 text-[#1E3A5F]" />
                <span className="text-[10px] sm:text-[11px]">Check</span>
              </button>
              <button
                onClick={() => handleOpenScanner("stockIn")}
                className="px-2 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-extrabold flex items-center gap-1 shadow-sm cursor-pointer whitespace-nowrap shrink-0"
              >
                <Boxes className="w-3.5 h-3.5 text-white" />
                <span className="text-[10px] sm:text-[11px]">Stock In</span>
              </button>
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="p-1.5 rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 cursor-pointer shrink-0"
              >
                {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>

        {/* Bottom Tier: Navigation Bar */}
        <div className="block bg-slate-50/70 border-b border-slate-200/60">
          <div className="max-w-7xl mx-auto px-1 sm:px-3 lg:px-8">
            <nav className="flex items-center gap-1 overflow-x-auto py-1.5 scrollbar-none snap-x snap-mandatory">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-2 px-2.5 sm:px-3 py-1.5 rounded-lg text-[10px] sm:text-xs font-bold transition-all whitespace-nowrap snap-start shrink-0 ${
                      isActive
                        ? "bg-white text-[#1BA6C4] font-extrabold shadow-2xs border border-slate-200/80"
                        : "text-slate-600 hover:text-[#1A2B3C] hover:bg-white/60"
                    }`}
                  >
                    <Icon className={`w-3.5 h-3.5 ${isActive ? "text-[#1BA6C4]" : "text-slate-400"}`} />
                    <span className="hidden sm:inline">{item.label}</span>
                    <span className="sm:hidden">{item.shortLabel}</span>
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-white border-b border-slate-200 px-4 pt-3 pb-6 space-y-3 shadow-lg">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 text-xs">
              <span className="text-slate-500 font-medium">Shop ID: #{session.user.shopId}</span>
              <span className="text-[#1BA6C4] font-extrabold uppercase">{session.user.role} Account</span>
            </div>

            <div className="grid grid-cols-2 gap-2 py-2">
              <button
                onClick={() => handleOpenScanner("check")}
                className="flex items-center justify-center gap-2 p-2.5 rounded-xl bg-slate-100 border border-slate-200 text-[#1A2B3C] text-xs font-bold"
              >
                <QrCode className="w-4 h-4 text-[#1BA6C4]" />
                Check Stock
              </button>
              <button
                onClick={() => handleOpenScanner("stockIn")}
                className="flex items-center justify-center gap-2 p-2.5 rounded-xl btn-primary-cyan text-white text-xs font-bold"
              >
                <Boxes className="w-4 h-4 text-white" />
                Stock In
              </button>
            </div>

            <div className="space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold ${
                      isActive
                        ? "bg-cyan-50 text-[#1BA6C4] border-l-4 border-[#1BA6C4] font-extrabold"
                        : "text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    <Icon className={`w-4 h-4 ${isActive ? "text-[#1BA6C4]" : "text-slate-400"}`} />
                    {item.label}
                  </Link>
                );
              })}
            </div>

            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="w-full flex items-center justify-center gap-2 mt-4 px-4 py-2.5 rounded-xl bg-rose-50 text-rose-600 border border-rose-200 text-sm font-bold"
            >
              <LogOut className="w-4 h-4" />
              Sign Out ({session.user.name})
            </button>
          </div>
        )}
      </header>

      {/* Barcode Scanner Modal */}
      {scannerOpen && (
        <BarcodeScannerModal
          mode={scannerMode}
          onClose={() => setScannerOpen(false)}
          onSelectMode={(mode) => setScannerMode(mode)}
        />
      )}
    </>
  );
}
