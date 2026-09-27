"use client";

import { useState, useEffect } from "react";
import {
  KeyRound,
  Mail,
  Lock,
  Eye,
  EyeOff,
  X,
  ArrowRight,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  ShieldCheck,
  Copy,
  Check,
  Sparkles,
} from "lucide-react";
import { validateEmail } from "@/lib/emailValidation";

interface ForgotPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialEmail?: string;
  onSuccess?: () => void;
}

export default function ForgotPasswordModal({
  isOpen,
  onClose,
  initialEmail = "",
  onSuccess,
}: ForgotPasswordModalProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [email, setEmail] = useState(initialEmail);
  const [maskedEmail, setMaskedEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [demoCode, setDemoCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [copiedCode, setCopiedCode] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);

  // Sync initial email when modal opens
  useEffect(() => {
    if (isOpen) {
      setEmail(initialEmail);
      setStep(1);
      setErrorMsg("");
      setSuccessMsg("");
      setOtpCode("");
      setDemoCode("");
      setNewPassword("");
      setConfirmPassword("");
    }
  }, [isOpen, initialEmail]);

  // Resend countdown timer
  useEffect(() => {
    if (resendTimer > 0) {
      const timer = setTimeout(() => setResendTimer(resendTimer - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendTimer]);

  if (!isOpen) return null;

  // Real-time email validation
  const emailValidation = email ? validateEmail(email) : null;

  // Real-time password strength check
  const getPasswordStrength = (pass: string) => {
    let score = 0;
    if (pass.length >= 8) score++;
    if (/[A-Z]/.test(pass) && /[a-z]/.test(pass)) score++;
    if (/[0-9]/.test(pass)) score++;
    if (/[^A-Za-z0-9]/.test(pass)) score++;
    return score;
  };

  const passwordStrength = getPasswordStrength(newPassword);

  const handleRequestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

    if (!email) {
      setErrorMsg("Please enter your registered email address.");
      return;
    }

    const val = validateEmail(email);
    if (!val.isValid) {
      setErrorMsg(val.error || "Please enter a valid email format.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data.error || "Failed to dispatch verification code.");
      } else {
        setMaskedEmail(data.maskedEmail || email);
        if (data.demoVerificationCode) {
          setDemoCode(data.demoVerificationCode);
        }
        setSuccessMsg("Security verification code generated successfully.");
        setStep(2);
        setResendTimer(60);
      }
    } catch (err: any) {
      setErrorMsg("Network error. Please try requesting a code again.");
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    if (resendTimer > 0 || loading) return;
    setLoading(true);
    setErrorMsg("");
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      const data = await res.json();
      if (res.ok) {
        if (data.demoVerificationCode) {
          setDemoCode(data.demoVerificationCode);
        }
        setSuccessMsg("New 6-digit verification code sent.");
        setResendTimer(60);
      } else {
        setErrorMsg(data.error || "Failed to resend code.");
      }
    } catch (e) {
      setErrorMsg("Network error during code resend.");
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

    if (!otpCode || otpCode.trim().length !== 6) {
      setErrorMsg("Please enter the complete 6-digit verification code.");
      return;
    }

    if (newPassword.length < 8) {
      setErrorMsg("Password must be at least 8 characters long.");
      return;
    }

    if (!/[a-zA-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      setErrorMsg("Password must contain a mix of letters and numbers.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMsg("Passwords do not match. Please verify.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          token: otpCode.trim(),
          newPassword,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data.error || "Failed to reset password.");
      } else {
        setStep(3);
        if (onSuccess) onSuccess();
      }
    } catch (err: any) {
      setErrorMsg("Network error during password reset.");
    } finally {
      setLoading(false);
    }
  };

  const handleCopyCode = () => {
    if (!demoCode) return;
    navigator.clipboard.writeText(demoCode);
    setCopiedCode(true);
    setOtpCode(demoCode);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden transition-all transform scale-100">
        {/* Decorative Top Accent Bar */}
        <div className="h-2 w-full bg-gradient-to-r from-[#1E3A5F] via-[#0D9488] to-[#4FC3E8]"></div>

        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-teal-50 border border-teal-100 text-teal-700">
              <KeyRound className="w-5 h-5 text-teal-600" />
            </div>
            <div>
              <h3 className="text-lg font-extrabold text-[#1E3A5F]">
                Reset Account Password
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                {step === 1 && "Step 1 of 2: Verify registered pharmacy email"}
                {step === 2 && "Step 2 of 2: Enter verification code & new password"}
                {step === 3 && "Password reset complete"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5">
          {/* Alerts */}
          {errorMsg && (
            <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && step === 1 && (
            <div className="p-3.5 rounded-2xl bg-teal-50 border border-teal-200 text-teal-800 text-xs font-semibold flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* STEP 1: Enter Email */}
          {step === 1 && (
            <form onSubmit={handleRequestCode} className="space-y-4">
              <p className="text-xs text-slate-600 leading-relaxed font-medium">
                Enter your registered MedTrack login email. We will verify your account and dispatch a 6-digit security code to reset your password.
              </p>

              <div>
                <label className="block text-xs font-extrabold text-[#1E3A5F] mb-1.5 uppercase tracking-wider">
                  Registered Email Address
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setErrorMsg("");
                    }}
                    placeholder="owner@pharmacy.com"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-3 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-teal-600 focus:bg-white focus:ring-2 focus:ring-teal-500/20 transition-all font-medium"
                  />
                </div>

                {/* Real-time Email Validation Badge */}
                {email && emailValidation && (
                  <div className="mt-2">
                    {emailValidation.isValid ? (
                      <div className="inline-flex items-center gap-1.5 text-xs font-bold text-teal-700 bg-teal-50 border border-teal-200 px-2.5 py-1 rounded-lg">
                        <CheckCircle2 className="w-3.5 h-3.5 text-teal-600" />
                        <span>Valid Email Format</span>
                      </div>
                    ) : (
                      <div className="inline-flex items-center gap-1.5 text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2.5 py-1 rounded-lg">
                        <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
                        <span>{emailValidation.error}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-bold transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || (emailValidation ? !emailValidation.isValid : false)}
                  className="px-5 py-2.5 rounded-xl bg-[#1E3A5F] hover:bg-[#0F2544] text-white text-xs font-bold flex items-center gap-2 shadow-md shadow-[#1E3A5F]/20 disabled:opacity-50 transition-all cursor-pointer"
                >
                  {loading ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Verifying Account...</span>
                    </>
                  ) : (
                    <>
                      <span>Send Verification Code</span>
                      <ArrowRight className="w-3.5 h-3.5 text-teal-300" />
                    </>
                  )}
                </button>
              </div>
            </form>
          )}

          {/* STEP 2: Enter OTP & New Password */}
          {step === 2 && (
            <form onSubmit={handleResetPassword} className="space-y-4">
              {/* Demo Simulated Dispatch Banner */}
              {demoCode && (
                <div className="p-4 rounded-2xl bg-gradient-to-br from-teal-500/10 via-emerald-500/5 to-cyan-500/10 border border-teal-300/60 text-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-extrabold text-teal-800">
                      <Sparkles className="w-4 h-4 text-teal-600" />
                      <span>System Dispatch Notification</span>
                    </div>
                    <button
                      type="button"
                      onClick={handleCopyCode}
                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-teal-700 hover:bg-teal-800 text-white rounded-lg text-[11px] font-bold transition-all shadow-sm cursor-pointer"
                    >
                      {copiedCode ? (
                        <>
                          <Check className="w-3 h-3 text-teal-200" />
                          <span>Auto-Filled!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>One-Click Fill ({demoCode})</span>
                        </>
                      )}
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-600">
                    Security Code sent to <span className="font-extrabold text-slate-800">{maskedEmail}</span>:
                  </p>
                  <div className="text-center font-mono text-xl font-extrabold text-[#1E3A5F] tracking-widest bg-white/80 py-1.5 rounded-xl border border-teal-200 shadow-inner">
                    {demoCode}
                  </div>
                </div>
              )}

              {/* 6-Digit OTP Field */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-extrabold text-[#1E3A5F] uppercase tracking-wider">
                    6-Digit Security Code *
                  </label>
                  <button
                    type="button"
                    onClick={handleResendCode}
                    disabled={resendTimer > 0 || loading}
                    className="text-[11px] text-teal-700 hover:underline font-bold disabled:opacity-50 disabled:no-underline cursor-pointer"
                  >
                    {resendTimer > 0 ? `Resend code in ${resendTimer}s` : "Resend Code"}
                  </button>
                </div>
                <div className="relative">
                  <ShieldCheck className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                  <input
                    type="text"
                    maxLength={6}
                    required
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                    placeholder="Enter 6-digit code (e.g. 123456)"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-3 text-sm font-mono tracking-wider text-slate-800 placeholder-slate-400 focus:outline-none focus:border-teal-600 focus:bg-white focus:ring-2 focus:ring-teal-500/20 transition-all font-bold"
                  />
                </div>
              </div>

              {/* New Password */}
              <div>
                <label className="block text-xs font-extrabold text-[#1E3A5F] mb-1.5 uppercase tracking-wider">
                  New Password *
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Minimum 8 characters"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-10 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-teal-600 focus:bg-white focus:ring-2 focus:ring-teal-500/20 transition-all font-medium"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-3 text-slate-400 hover:text-slate-600 focus:outline-none cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                {/* Password Strength Meter */}
                {newPassword && (
                  <div className="mt-2 space-y-1">
                    <div className="flex items-center justify-between text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                      <span>Password Strength</span>
                      <span
                        className={
                          passwordStrength <= 1
                            ? "text-rose-600"
                            : passwordStrength <= 3
                            ? "text-amber-600"
                            : "text-emerald-600"
                        }
                      >
                        {passwordStrength <= 1 ? "Weak" : passwordStrength <= 3 ? "Good" : "Strong"}
                      </span>
                    </div>
                    <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden flex gap-1">
                      <div
                        className={`h-full flex-1 transition-colors ${
                          passwordStrength >= 1 ? (passwordStrength === 1 ? "bg-rose-500" : passwordStrength <= 3 ? "bg-amber-500" : "bg-emerald-500") : "bg-transparent"
                        }`}
                      ></div>
                      <div
                        className={`h-full flex-1 transition-colors ${
                          passwordStrength >= 2 ? (passwordStrength <= 3 ? "bg-amber-500" : "bg-emerald-500") : "bg-transparent"
                        }`}
                      ></div>
                      <div
                        className={`h-full flex-1 transition-colors ${
                          passwordStrength >= 3 ? (passwordStrength <= 3 ? "bg-amber-500" : "bg-emerald-500") : "bg-transparent"
                        }`}
                      ></div>
                      <div
                        className={`h-full flex-1 transition-colors ${
                          passwordStrength >= 4 ? "bg-emerald-500" : "bg-transparent"
                        }`}
                      ></div>
                    </div>
                  </div>
                )}
              </div>

              {/* Confirm Password */}
              <div>
                <label className="block text-xs font-extrabold text-[#1E3A5F] mb-1.5 uppercase tracking-wider">
                  Confirm New Password *
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter new password"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-teal-600 focus:bg-white focus:ring-2 focus:ring-teal-500/20 transition-all font-medium"
                  />
                </div>
                {confirmPassword && newPassword !== confirmPassword && (
                  <p className="mt-1 text-[11px] font-bold text-rose-600">
                    Passwords do not match.
                  </p>
                )}
              </div>

              <div className="pt-2 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-bold transition-colors cursor-pointer"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={loading || otpCode.length !== 6 || newPassword.length < 8 || newPassword !== confirmPassword}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#1E3A5F] to-[#0D9488] hover:from-[#0F2544] hover:to-[#0F766E] text-white text-xs font-bold flex items-center gap-2 shadow-md disabled:opacity-50 transition-all cursor-pointer"
                >
                  {loading ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Updating Password...</span>
                    </>
                  ) : (
                    <>
                      <span>Reset Password & Secure</span>
                      <ShieldCheck className="w-4 h-4 text-teal-300" />
                    </>
                  )}
                </button>
              </div>
            </form>
          )}

          {/* STEP 3: Success View */}
          {step === 3 && (
            <div className="py-6 text-center space-y-4">
              <div className="inline-flex p-4 rounded-full bg-teal-100 text-teal-700 shadow-inner">
                <CheckCircle2 className="w-10 h-10 text-teal-600 animate-bounce" />
              </div>
              <div className="space-y-1">
                <h4 className="text-xl font-extrabold text-[#1E3A5F]">
                  Password Successfully Reset!
                </h4>
                <p className="text-xs text-slate-500 font-medium max-w-sm mx-auto">
                  Your security credentials have been updated in the database. You can now log into your MedTrack pharmacy dashboard with your new password.
                </p>
              </div>
              <div className="pt-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full py-3 px-6 rounded-xl bg-[#1E3A5F] hover:bg-[#0F2544] text-white font-bold text-xs shadow-lg shadow-[#1E3A5F]/20 transition-all cursor-pointer"
                >
                  Sign In with New Password
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
