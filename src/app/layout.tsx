import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import AuthProvider from "@/components/AuthProvider";
import Navbar from "@/components/Navbar";
import AppContainer from "@/components/AppContainer";
import SessionInactivityManager from "@/components/SessionInactivityManager";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "MedTrack | Medicine Stock & Expiry Tracker for Local Pharmacies",
  description:
    "Web-based batch-level pharmacy stock management system enforcing FEFO dispensing, 5-tier expiry alerts, barcode scanning, and drug inspector compliance exports.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full bg-slate-50 text-slate-800 antialiased overflow-x-hidden">
      <body
        className={`${inter.className} min-h-full flex flex-col bg-slate-50 font-sans selection:bg-teal-600 selection:text-white overflow-x-hidden w-full`}
      >
        <AuthProvider>
          <Navbar />
          <SessionInactivityManager />
          <AppContainer>{children}</AppContainer>
        </AuthProvider>
      </body>
    </html>
  );
}
