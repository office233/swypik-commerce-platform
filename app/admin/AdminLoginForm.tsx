"use client";

import { useState } from "react";

type AdminLoginFormProps = {
  mode: "login" | "misconfigured";
};

type Step = "password" | "totp";

export default function AdminLoginForm({ mode }: AdminLoginFormProps) {
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [tempToken, setTempToken] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("password");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [setupNotice, setSetupNotice] = useState<string | null>(null);

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mode !== "login") {
      return;
    }

    setLoading(true);
    setError("");

    try {
      // Step 1: send password. Server replies either:
      //   { success: true }                          → already logged in (TOTP not configured yet, grace)
      //   { success: true, needsTotpSetup: true }    → grace login + nag the user to set up TOTP
      //   { success: true, needsTotp: true, tempToken } → switch to step 2
      //   { success: false, error }                  → wrong password / rate limited
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      const payload = await response.json();
      if (!response.ok || !payload.success) {
        setError(payload.error || "Authentication failed.");
        return;
      }

      if (payload.needsTotp && payload.tempToken) {
        // Pivot to step 2 — keep password in state hidden but cleared from UI.
        setTempToken(payload.tempToken);
        setStep("totp");
        setError("");
        return;
      }

      // No TOTP needed (grace path or already enrolled session restored).
      if (payload.needsTotpSetup) {
        // Tell the user we let them in, but they MUST enroll now.
        // Push them to the setup page rather than the dashboard.
        window.location.href = "/admin/setup-2fa";
        return;
      }

      window.location.reload();
    } catch {
      setError("Could not reach the admin login endpoint.");
    } finally {
      setLoading(false);
    }
  }

  async function handleTotp(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!tempToken) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tempToken, totpCode }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        setError(payload.error || "TOTP verification failed.");
        return;
      }
      window.location.reload();
    } catch {
      setError("Could not reach the admin login endpoint.");
    } finally {
      setLoading(false);
    }
  }

  // Unused but kept for parity with original symbol.
  void setSetupNotice;

  return (
    <div className="min-h-screen bg-[#F7F7F8] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl border border-[#E5E5E5] p-8 shadow-lg">
          <div className="mb-8">
            <h1 className="text-2xl font-black text-[#0D0D0D]">Swypik Admin</h1>
            <p className="text-sm text-[#6E6E80] mt-2">
              {mode === "misconfigured"
                ? "ADMIN_SECRET is missing. Configure it before using the admin surface."
                : "Sign in with the admin password to manage orders, marketplace products, and sellers."}
            </p>
          </div>

          {mode === "login" && step === "password" ? (
            <form method="post" onSubmit={handleLogin} className="space-y-4">
              <div>
                <label htmlFor="admin-password" className="block text-sm font-bold text-[#0D0D0D] mb-2">
                  Admin password
                </label>
                <input
                  id="admin-password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter admin password"
                  autoFocus
                  className="w-full rounded-xl border border-[#E5E5E5] px-4 py-3.5 text-sm font-medium text-[#0D0D0D] outline-none focus:border-[#0D0D0D] focus:ring-1 focus:ring-[#0D0D0D] transition"
                />
              </div>
              {error ? <p className="text-sm font-bold text-[#df1b41]">{error}</p> : null}
              <button
                type="submit"
                disabled={loading || !password.trim()}
                className="w-full rounded-xl bg-[#0D0D0D] py-3.5 text-sm font-bold text-white disabled:opacity-50 transition-transform active:scale-[0.98]"
              >
                {loading ? "Signing in..." : "Continue"}
              </button>
            </form>
          ) : mode === "login" && step === "totp" ? (
            <form method="post" onSubmit={handleTotp} className="space-y-4">
              <div className="rounded-xl border border-[#E5E5E5] bg-[#F7F7F8] px-4 py-3 text-xs text-[#3C3C43]">
                Password accepted. Enter the 6-digit code from your authenticator app
                (or an 8-char backup code).
              </div>
              <div>
                <label htmlFor="admin-totp" className="block text-sm font-bold text-[#0D0D0D] mb-2">
                  Authentication code
                </label>
                <input
                  id="admin-totp"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={totpCode}
                  onChange={(event) => setTotpCode(event.target.value.trim())}
                  placeholder="123456"
                  autoFocus
                  maxLength={16}
                  className="w-full rounded-xl border border-[#E5E5E5] px-4 py-3.5 text-base font-mono tracking-widest text-[#0D0D0D] outline-none focus:border-[#0D0D0D] focus:ring-1 focus:ring-[#0D0D0D] transition"
                />
              </div>
              {error ? <p className="text-sm font-bold text-[#df1b41]">{error}</p> : null}
              <button
                type="submit"
                disabled={loading || totpCode.length < 6}
                className="w-full rounded-xl bg-[#0D0D0D] py-3.5 text-sm font-bold text-white disabled:opacity-50 transition-transform active:scale-[0.98]"
              >
                {loading ? "Verifying..." : "Verify & sign in"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setStep("password");
                  setTotpCode("");
                  setTempToken(null);
                  setError("");
                }}
                className="w-full text-center text-xs text-[#6E6E80] hover:text-[#0D0D0D] underline"
              >
                Back
              </button>
            </form>
          ) : (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Set `ADMIN_SECRET` in the environment and reload the page.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
