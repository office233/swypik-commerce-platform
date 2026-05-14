"use client";

import { useState } from "react";
import { Loader2, Lock, CheckCircle2, AlertCircle } from "lucide-react";

export default function SecurityPageClient({
  hasPassword,
}: {
  hasPassword: boolean;
}) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [show, setShow] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    if (password.length < 8) {
      setError("Parola trebuie să aibă cel puțin 8 caractere.");
      return;
    }
    if (password !== confirm) {
      setError("Parolele nu se potrivesc.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set_password", password }),
      });
      const j = await res.json();
      if (!res.ok || !j.success) {
        setError(j.error || "Nu am putut salva parola.");
        return;
      }
      setInfo("Parola a fost salvată.");
      setPassword("");
      setConfirm("");
    } catch {
      setError("Eroare de conexiune.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-md p-5 text-white">
      <h1 className="mb-2 text-2xl font-black">Securitate</h1>
      <p className="mb-6 text-sm text-white/60">
        {hasPassword
          ? "Schimbă parola contului tău."
          : "Setează o parolă ca să te poți autentifica fără cod email."}
      </p>

      {error && (
        <div className="mb-4 flex items-start gap-3 rounded-2xl border border-[#FE2C55]/30 bg-[#FE2C55]/10 p-4">
          <AlertCircle className="mt-0.5 h-5 w-5 text-[#FE2C55]" />
          <p className="text-sm font-semibold">{error}</p>
        </div>
      )}
      {info && (
        <div className="mb-4 flex items-start gap-3 rounded-2xl border border-[#10A37F]/30 bg-[#10A37F]/10 p-4">
          <CheckCircle2 className="mt-0.5 h-5 w-5 text-[#10A37F]" />
          <p className="text-sm font-semibold">{info}</p>
        </div>
      )}

      <form onSubmit={submit} className="space-y-4">
        <PasswordField
          label={hasPassword ? "Parolă nouă" : "Parolă"}
          value={password}
          onChange={setPassword}
          show={show}
          toggle={() => setShow((s) => !s)}
        />
        <PasswordField
          label="Confirmă parola"
          value={confirm}
          onChange={setConfirm}
          show={show}
          toggle={() => setShow((s) => !s)}
        />

        <button
          type="submit"
          disabled={loading || !password || !confirm}
          className="flex h-14 w-full items-center justify-center rounded-2xl bg-[#FE2C55] text-base font-black text-white transition active:scale-[0.98] disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Salvează parola"}
        </button>
      </form>
    </main>
  );
}

function PasswordField({
  label,
  value,
  onChange,
  show,
  toggle,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  toggle: () => void;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-bold uppercase tracking-widest text-white/60">
        {label}
      </span>
      <span className="relative block">
        <Lock className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-white/40" />
        <input
          type={show ? "text" : "password"}
          autoComplete="new-password"
          minLength={8}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="••••••••"
          className="w-full rounded-2xl border border-white/10 bg-white/[0.04] py-4 pl-12 pr-16 text-base text-white outline-none focus:border-[#FE2C55] focus:ring-2 focus:ring-[#FE2C55]/30"
        />
        <button
          type="button"
          onClick={toggle}
          className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 text-xs font-bold text-white/60 hover:text-white"
        >
          {show ? "Ascunde" : "Arată"}
        </button>
      </span>
    </label>
  );
}
