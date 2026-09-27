"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useSession, signOut } from "next-auth/react";
import { usePathname } from "next/navigation";
import { Clock, ShieldAlert, LogOut, RefreshCw } from "lucide-react";

// Inactivity configuration (in seconds)
const TIMEOUT_SECONDS = 900; // 15 minutes
const WARNING_SECONDS = 60; // Show warning modal 60s before auto-logout
const HEARTBEAT_INTERVAL_MS = 120000; // Ping server every 2 minutes while active

export default function SessionInactivityManager() {
  const { data: session, status } = useSession();
  const pathname = usePathname();

  const [showWarning, setShowWarning] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(WARNING_SECONDS);

  const lastActivityRef = useRef<number>(Date.now());
  const lastHeartbeatRef = useRef<number>(Date.now());
  const warningTimerRef = useRef<NodeJS.Timeout | null>(null);

  const isAuthPage = pathname === "/login" || pathname === "/register";

  // Heartbeat ping to server
  const sendHeartbeat = useCallback(async () => {
    if (status !== "authenticated") return;
    try {
      await fetch("/api/auth/session-activity", { method: "POST" });
      lastHeartbeatRef.current = Date.now();
    } catch {
      // ignore network blips
    }
  }, [status]);

  // Execute logout on timeout
  const handleAutoLogout = useCallback(async () => {
    setShowWarning(false);
    try {
      await fetch("/api/auth/session-activity", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "timeout" }),
      });
    } catch {
      // proceed to sign out
    }
    signOut({ callbackUrl: "/login?timeout=1" });
  }, []);

  // Continue session when user responds to warning modal
  const handleStayLoggedIn = useCallback(() => {
    lastActivityRef.current = Date.now();
    setShowWarning(false);
    setSecondsRemaining(WARNING_SECONDS);
    sendHeartbeat();
  }, [sendHeartbeat]);

  // Track user activity (debounced)
  useEffect(() => {
    if (status !== "authenticated" || isAuthPage) return;

    const handleUserActivity = () => {
      lastActivityRef.current = Date.now();

      // If warning was showing, and user moves mouse / types, keep working
      if (showWarning) {
        setShowWarning(false);
      }

      // Check if periodic heartbeat needed
      if (Date.now() - lastHeartbeatRef.current > HEARTBEAT_INTERVAL_MS) {
        sendHeartbeat();
      }
    };

    const events = ["mousedown", "keydown", "scroll", "touchstart"];
    events.forEach((evt) => window.addEventListener(evt, handleUserActivity, { passive: true }));

    // Regular interval to check idle time
    const interval = setInterval(() => {
      const idleSeconds = Math.floor((Date.now() - lastActivityRef.current) / 1000);

      if (idleSeconds >= TIMEOUT_SECONDS) {
        handleAutoLogout();
      } else if (idleSeconds >= TIMEOUT_SECONDS - WARNING_SECONDS) {
        const remaining = Math.max(0, TIMEOUT_SECONDS - idleSeconds);
        setSecondsRemaining(remaining);
        setShowWarning(true);
      } else {
        setShowWarning(false);
      }
    }, 1000);

    return () => {
      events.forEach((evt) => window.removeEventListener(evt, handleUserActivity));
      clearInterval(interval);
    };
  }, [status, isAuthPage, showWarning, sendHeartbeat, handleAutoLogout]);

  if (!showWarning || status !== "authenticated" || isAuthPage) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl border border-amber-300 text-center space-y-5">
        <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center mx-auto shadow-sm">
          <Clock className="w-7 h-7 animate-pulse" />
        </div>

        <div className="space-y-2">
          <span className="px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-amber-100 text-amber-900 border border-amber-200">
            Security Inactivity Notice
          </span>
          <h3 className="text-xl font-black text-[#1E3A5F]">Session Expiring Soon</h3>
          <p className="text-xs text-slate-500 font-medium">
            For medical record privacy and inventory security, inactive sessions are automatically locked.
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
            Auto Logout In
          </span>
          <span className="text-3xl font-black text-rose-600 font-mono">
            {secondsRemaining}s
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 pt-2">
          <button
            onClick={() => {
              signOut({ callbackUrl: "/login" });
            }}
            className="py-3 px-4 rounded-2xl bg-slate-100 hover:bg-rose-50 text-slate-700 hover:text-rose-700 border border-slate-200 text-xs font-extrabold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>Log Out</span>
          </button>

          <button
            onClick={handleStayLoggedIn}
            className="py-3 px-4 rounded-2xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-extrabold flex items-center justify-center gap-1.5 shadow-md shadow-teal-600/20 transition-all transform active:scale-95 cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
            <span>I'm Still Here</span>
          </button>
        </div>
      </div>
    </div>
  );
}
