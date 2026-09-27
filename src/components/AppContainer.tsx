"use client";

import { usePathname } from "next/navigation";

export default function AppContainer({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuthPage = pathname === "/login" || pathname === "/register";

  if (isAuthPage) {
    return (
      <main className="flex-1 w-full flex flex-col min-h-screen bg-[#0B3D91]">
        {children}
      </main>
    );
  }

  return (
    <>
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8 min-w-0 overflow-x-hidden">
        {children}
      </main>
      <footer className="border-t border-slate-200 bg-white py-6 text-center text-xs text-slate-500 shadow-xs w-full">
        <p className="px-4">
          MedTrack v2.0 • NEP Field Project Topic #23 • Authored by Talha Zahoor Ahmed Chougle
        </p>
      </footer>
    </>
  );
}
