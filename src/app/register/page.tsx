"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Pill,
  Building2,
  User,
  Mail,
  Lock,
  Phone,
  FileText,
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
  Eye,
  EyeOff,
} from "lucide-react";
import { validateEmail } from "@/lib/emailValidation";

export default function RegisterPage() {
  const router = useRouter();
  const { status } = useSession();
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (status === "authenticated") {
      router.push("/");
    }
  }, [status, router]);

  const [formData, setFormData] = useState({
    shopName: "",
    address: "",
    phone: "",
    licenseNumber: "",
    name: "",
    email: "",
    password: "",
  });

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Real-time email validation
  const emailValidation = formData.email ? validateEmail(formData.email) : null;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    if (errorMsg) setErrorMsg("");
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

    if (!formData.email) {
      setErrorMsg("Email address is required.");
      return;
    }

    const val = validateEmail(formData.email);
    if (!val.isValid) {
      setErrorMsg(val.error || "Please enter a valid, active email address.");
      return;
    }

    if (formData.password.length < 6) {
      setErrorMsg("Password should be at least 6 characters long.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data.error || "Registration failed.");
      } else {
        setSuccessMsg(
          "Pharmacy and Owner account created successfully! Redirecting to login..."
        );
        setTimeout(() => {
          router.push("/login");
        }, 1500);
      }
    } catch (err: any) {
      setErrorMsg("Network error during registration.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex-1 bg-auth-gradient flex items-center justify-center p-4 sm:p-6 lg:p-8">
      <div className="max-w-xl w-full space-y-8 bg-white border border-white/20 p-8 rounded-3xl shadow-2xl relative overflow-hidden">
        {/* Top Glow */}
        <div className="absolute -top-24 -left-24 w-48 h-48 bg-[#4FC3E8]/20 rounded-full blur-3xl pointer-events-none"></div>

        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex p-3 rounded-2xl bg-[#1E3A5F] text-white shadow-md shadow-[#1E3A5F]/20">
            <Pill className="w-8 h-8 text-teal-400" />
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#1E3A5F]">
            Register New Pharmacy
          </h2>
          <p className="text-xs text-slate-500 font-medium">
            Create your pharmacy tenant and owner manager account in one simple step
          </p>
        </div>

        {/* Alerts */}
        {errorMsg && (
          <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="p-4 rounded-2xl bg-teal-50 border border-teal-200 text-teal-800 text-xs font-semibold flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Register Form */}
        <form onSubmit={handleRegister} className="space-y-4">
          <div className="space-y-3 pt-2">
            <h3 className="text-xs font-extrabold text-[#1E3A5F] uppercase tracking-widest border-b border-slate-200 pb-1.5">
              Pharmacy Details
            </h3>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Pharmacy / Shop Name *
              </label>
              <div className="relative">
                <Building2 className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="text"
                  name="shopName"
                  required
                  value={formData.shopName}
                  onChange={handleChange}
                  placeholder="e.g. Apex Local Chemist"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-teal-600 focus:bg-white focus:ring-2 focus:ring-teal-500/20 font-medium"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Contact Phone
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                  <input
                    type="text"
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    placeholder="+91 9876543210"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-teal-600 focus:bg-white focus:ring-2 focus:ring-teal-500/20 font-medium"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Drug License Number
                </label>
                <div className="relative">
                  <FileText className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                  <input
                    type="text"
                    name="licenseNumber"
                    value={formData.licenseNumber}
                    onChange={handleChange}
                    placeholder="DL-MH-123456"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-teal-600 focus:bg-white focus:ring-2 focus:ring-teal-500/20 font-medium"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Shop Address
              </label>
              <input
                type="text"
                name="address"
                value={formData.address}
                onChange={handleChange}
                placeholder="Shop No. 4, Station Road, Mumbai"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-teal-600 focus:bg-white focus:ring-2 focus:ring-teal-500/20 font-medium"
              />
            </div>
          </div>

          <div className="space-y-3 pt-4">
            <h3 className="text-xs font-extrabold text-teal-700 uppercase tracking-widest border-b border-slate-200 pb-1.5">
              Owner Account Credentials
            </h3>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Owner / Manager Full Name *
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="text"
                  name="name"
                  required
                  value={formData.name}
                  onChange={handleChange}
                  placeholder="e.g. Dr. Rajesh Sharma"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-teal-600 focus:bg-white focus:ring-2 focus:ring-teal-500/20 font-medium"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Login Email *
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                  <input
                    type="email"
                    name="email"
                    required
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="owner@pharmacy.com"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-teal-600 focus:bg-white focus:ring-2 focus:ring-teal-500/20 font-medium"
                  />
                </div>

                {/* Real-time Email Validation Indicator */}
                {formData.email && emailValidation && (
                  <div className="mt-1.5">
                    {emailValidation.isValid ? (
                      <div className="inline-flex items-center gap-1.5 text-[11px] font-bold text-teal-700 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded-lg">
                        <CheckCircle2 className="w-3 h-3 text-teal-600" />
                        <span>Valid Email</span>
                        {emailValidation.suggestion && (
                          <button
                            type="button"
                            onClick={() =>
                              setFormData({
                                ...formData,
                                email: emailValidation.suggestion!,
                              })
                            }
                            className="ml-1 text-amber-700 underline hover:text-amber-900 cursor-pointer"
                          >
                            (Use {emailValidation.suggestion}?)
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-lg">
                        <AlertTriangle className="w-3 h-3 text-rose-500 shrink-0" />
                        <span>{emailValidation.error}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Password *
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3 pointer-events-none" />
                  <input
                    type={showPassword ? "text" : "password"}
                    name="password"
                    required
                    value={formData.password}
                    onChange={handleChange}
                    placeholder="••••••••••••"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-10 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-teal-600 focus:bg-white focus:ring-2 focus:ring-teal-500/20 font-medium"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-3 text-slate-400 hover:text-slate-600 focus:outline-none transition-colors cursor-pointer"
                    title={showPassword ? "Hide password" : "Show password"}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={
              loading || (emailValidation ? !emailValidation.isValid : false)
            }
            className="w-full mt-4 py-3.5 px-4 rounded-xl bg-gradient-to-r from-[#1E3A5F] via-[#0F2544] to-[#0D9488] hover:from-[#0F2544] hover:to-[#0F766E] text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-[#1E3A5F]/20 transition-all transform active:scale-[0.99] disabled:opacity-50 cursor-pointer"
          >
            <span>Register Pharmacy & Account</span>
            <ArrowRight className="w-4 h-4 text-teal-300" />
          </button>
        </form>

        <div className="pt-2 text-center">
          <p className="text-xs text-slate-500 font-medium">
            Already registered?{" "}
            <Link href="/login" className="text-teal-700 font-bold hover:underline">
              Back to Login
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
