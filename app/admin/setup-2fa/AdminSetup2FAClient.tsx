"use client";

import { useEffect, useState } from "react";

/**
 * 3-step wizard for admin TOTP enrollment:
 *   1. Click "Generate secret"  →  POST /api/admin/2fa/init
 *      Server returns { secret, otpauthUrl } — we show both
 *      (so the admin can scan the QR or copy the secret manually).
 *   2. Admin scans the QR with their authenticator and enters the
 *      6-digit code shown there.
 *      POST /api/admin/2fa/enable with the code.
 *      Server returns 10 backup codes — we display once.
 *   3. Admin clicks "Done" → we redirect to /admin.
 *
 * QR rendering: we use the public chart endpoint
 *   https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=…
 * which is fine for an admin-only page. If you don't want to depend on
 * an external service, swap with `qrcode.react` (already in deps for
 * the user-side 2FA page).
 */
export default function AdminSetup2FAClient() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [secret, setSecret] = useState<string | null>(null);
  const [otpauthUrl, setOtpauthUrl] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);

  async function startInit() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/2fa/init", { method: "POST" });
      const j = await r.json();
      if (!r.ok || !j.success) {
        setError(j?.error || "Failed to initialize TOTP.");
        return;
      }
      setSecret(j.secret);
      setOtpauthUrl(j.otpauthUrl);
      setStep(2);
    } catch {
      setError("Network error.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmEnable(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!/^\d{6}$/.test(code)) {
      setError("Enter the 6-digit code from your authenticator.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/2fa/enable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const j = await r.json();
      if (!r.ok || !j.success) {
        setError(j?.error || "Verification failed.");
        return;
      }
      setBackupCodes(Array.isArray(j.backupCodes) ? j.backupCodes : []);
      setStep(3);
    } catch {
      setError("Network error.");
    } finally {
      setBusy(false);
    }
  }

  // Clear sensitive material from React state on unmount.
  useEffect(() => {
    return () => {
      setSecret(null);
      setBackupCodes([]);
    };
  }, []);

  const qrSrc = otpauthUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(otpauthUrl)}`
    : null;

  return (
    <main className="min-h-screen bg-[#F7F7F8] py-12 px-4">
      <div className="mx-auto max-w-xl bg-white rounded-2xl border border-[#E5E5E5] p-8 shadow-lg">
        <h1 className="text-2xl font-black text-[#0D0D0D] mb-2">Admin 2FA Setup</h1>
        <p className="text-sm text-[#6E6E80] mb-6">
          Enroll a TOTP authenticator (Google Authenticator, 1Password, Authy, etc.).
          After this is enabled, every admin login will require a code.
        </p>

        <ol className="flex items-center gap-3 text-xs mb-6">
          {[1, 2, 3].map((n) => (
            <li
              key={n}
              className={`px-3 py-1.5 rounded-full font-bold ${
                step >= (n as 1 | 2 | 3)
                  ? "bg-[#0D0D0D] text-white"
                  : "bg-[#F0F0F0] text-[#6E6E80]"
              }`}
            >
              Step {n}
            </li>
          ))}
        </ol>

        {step === 1 && (
          <div className="space-y-4">
            <p className="text-sm text-[#3C3C43]">
              Click below to generate a fresh TOTP secret. Anything generated
              previously will be replaced.
            </p>
            <button
              type="button"
              onClick={startInit}
              disabled={busy}
              className="w-full rounded-xl bg-[#0D0D0D] py-3.5 text-sm font-bold text-white disabled:opacity-50"
            >
              {busy ? "Generating..." : "Generate secret"}
            </button>
          </div>
        )}

        {step === 2 && (
          <form onSubmit={confirmEnable} className="space-y-4">
            <div className="flex flex-col items-center gap-3">
              {qrSrc && (
                <img
                  src={qrSrc}
                  alt="TOTP QR code"
                  width={240}
                  height={240}
                  className="rounded-xl border border-[#E5E5E5]"
                />
              )}
              <div className="w-full">
                <label className="block text-xs font-bold text-[#6E6E80] mb-1">
                  Manual entry secret (base32)
                </label>
                <code className="block w-full break-all rounded-lg bg-[#F7F7F8] border border-[#E5E5E5] px-3 py-2 text-xs font-mono text-[#0D0D0D]">
                  {secret}
                </code>
              </div>
            </div>
            <div>
              <label htmlFor="totp-code" className="block text-sm font-bold text-[#0D0D0D] mb-2">
                Enter the 6-digit code your app shows
              </label>
              <input
                id="totp-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value.trim())}
                maxLength={6}
                placeholder="123456"
                className="w-full rounded-xl border border-[#E5E5E5] px-4 py-3.5 text-base font-mono tracking-widest text-[#0D0D0D] outline-none focus:border-[#0D0D0D] focus:ring-1 focus:ring-[#0D0D0D]"
              />
            </div>
            {error && <p className="text-sm font-bold text-[#df1b41]">{error}</p>}
            <button
              type="submit"
              disabled={busy || code.length !== 6}
              className="w-full rounded-xl bg-[#0D0D0D] py-3.5 text-sm font-bold text-white disabled:opacity-50"
            >
              {busy ? "Verifying..." : "Activate 2FA"}
            </button>
          </form>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <p className="font-bold mb-1">Save these backup codes</p>
              <p>
                Each code works ONCE if you lose your authenticator. They will
                never be shown again. Print or store them in a password
                manager now.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 font-mono text-sm">
              {backupCodes.map((c) => (
                <code key={c} className="rounded-lg bg-[#F7F7F8] border border-[#E5E5E5] px-3 py-2 text-center">
                  {c}
                </code>
              ))}
            </div>
            <button
              type="button"
              onClick={() => {
                window.location.href = "/admin";
              }}
              className="w-full rounded-xl bg-[#0D0D0D] py-3.5 text-sm font-bold text-white"
            >
              I have saved them — go to admin
            </button>
          </div>
        )}

        {step !== 2 && error && (
          <p className="text-sm font-bold text-[#df1b41] mt-4">{error}</p>
        )}
      </div>
    </main>
  );
}
