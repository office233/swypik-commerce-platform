"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Loader2,
  Mail,
  KeyRound,
  ArrowLeft,
  AlertCircle,
  CheckCircle2,
  Lock,
  User as UserIcon,
  Phone,
  AtSign,
} from "lucide-react";

type Mode = "login" | "signup";

type Props = {
  mode: Mode;
  nextPath: string;
};

export default function AuthFormClient({ mode, nextPath }: Props) {
  if (mode === "login") {
    return <LoginForm nextPath={nextPath} />;
  }
  return <SignupWizard nextPath={nextPath} />;
}

/* ════════════════════════════════════════════════════════════════
   LOGIN — tabs (parolă | cod email)
   ════════════════════════════════════════════════════════════════ */

function LoginForm({ nextPath }: { nextPath: string }) {
  const router = useRouter();
  const [tab, setTab] = useState<"password" | "otp">("password");
  const [step, setStep] = useState<"email" | "otp_code">("email");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [twoFa, setTwoFa] = useState<{ tempToken: string } | null>(null);
  const [twoFaCode, setTwoFaCode] = useState("");

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  async function submitPassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "login_password",
          email: email.trim().toLowerCase(),
          password,
          next: nextPath || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || "Email sau parolă incorectă.");
        return;
      }
      if (data.requires2FA && data.tempToken) {
        setTwoFa({ tempToken: data.tempToken });
        return;
      }
      const target =
        typeof data.redirectTo === "string" && data.redirectTo.startsWith("/")
          ? data.redirectTo
          : nextPath || "/account";
      window.location.assign(target);
      router.refresh();
    } catch {
      setError("Eroare de conexiune. Reîncearcă.");
    } finally {
      setLoading(false);
    }
  }

  async function verify2FA(e: React.FormEvent) {
    e.preventDefault();
    if (!twoFa) return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify_2fa", tempToken: twoFa.tempToken, code: twoFaCode.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || "Cod invalid.");
        return;
      }
      const target =
        typeof data.redirectTo === "string" && data.redirectTo.startsWith("/")
          ? data.redirectTo
          : nextPath || "/account";
      window.location.assign(target);
      router.refresh();
    } catch {
      setError("Eroare de conexiune.");
    } finally {
      setLoading(false);
    }
  }

  async function sendOtp(action: "login" | "resend_otp") {
    setLoading(true);
    setError(null);
    setInfo(null);
    setDevOtp(null);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, email: email.trim().toLowerCase() }),
      });
      const data = await res.json();
      if (!res.ok || !data.requiresVerification) {
        setError(data.error || "Nu am putut trimite codul.");
        return;
      }
      if (data.devOtp) setDevOtp(String(data.devOtp));
      setStep("otp_code");
      setResendCooldown(30);
      if (action === "resend_otp") {
        setInfo("Am trimis un cod nou. Verifică email + spam.");
      }
    } catch {
      setError("Nu am putut contacta serverul.");
    } finally {
      setLoading(false);
    }
  }

  async function submitOtp(e: React.FormEvent) {
    e.preventDefault();
    if (otp.length !== 6) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "verify_otp",
          email: email.trim().toLowerCase(),
          token: otp,
          next: nextPath || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || "Cod invalid sau expirat.");
        return;
      }
      const target =
        typeof data.redirectTo === "string" && data.redirectTo.startsWith("/")
          ? data.redirectTo
          : nextPath || "/account";
      window.location.assign(target);
      router.refresh();
    } catch {
      setError("Eroare de conexiune.");
    } finally {
      setLoading(false);
    }
  }

  if (twoFa) {
    return (
      <div className="min-h-screen bg-[#0D0D0D] text-white flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-sm rounded-3xl bg-white/[0.04] border border-white/10 p-6">
          <h1 className="text-2xl font-black mb-2">Verificare în doi pași</h1>
          <p className="text-sm text-white/60 mb-6">Introdu codul din aplicația de autentificare sau un cod de rezervă.</p>
          <form onSubmit={verify2FA} className="space-y-4">
            <input
              type="text"
              name="otp"
              autoComplete="one-time-code"
              inputMode="numeric"
              maxLength={8}
              autoFocus
              value={twoFaCode}
              onChange={(e) => setTwoFaCode(e.target.value)}
              placeholder="123456 sau cod rezervă"
              className="w-full text-center tracking-[0.3em] text-xl rounded-2xl bg-white/5 border border-white/10 px-4 py-4 font-black text-white outline-none focus:border-[#7C3AED]"
            />
            {error && <p className="text-sm font-bold text-[#7C3AED] text-center">{error}</p>}
            <button
              type="submit"
              disabled={loading || twoFaCode.length < 6}
              className="w-full rounded-2xl bg-[#7C3AED] hover:bg-[#E0264A] py-4 font-black text-white disabled:opacity-50"
            >
              {loading ? "Verificăm..." : "Confirmă"}
            </button>
            <button
              type="button"
              onClick={() => { setTwoFa(null); setTwoFaCode(""); setError(null); }}
              className="w-full text-xs text-white/50 hover:text-white"
            >
              Înapoi la login
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <section className="flex flex-1 flex-col">
      <div className="mb-6">
        <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
          {step === "otp_code" ? "Verifică emailul" : "Bine ai revenit"}
        </h1>
        <p className="mt-2 text-sm text-white/60">
          {step === "otp_code" ? (
            <>Codul a fost trimis pe <b className="text-white">{email}</b>.</>
          ) : (
            "Intră în cont cu parola sau cere un cod pe email."
          )}
        </p>
      </div>

      {step === "email" && (
        <div className="mb-5 grid grid-cols-2 gap-2 rounded-2xl bg-white/5 p-1">
          <button
            type="button"
            onClick={() => setTab("password")}
            className={`rounded-xl py-2 text-sm font-bold transition ${
              tab === "password" ? "bg-white text-black" : "text-white/60"
            }`}
          >
            Parolă
          </button>
          <button
            type="button"
            onClick={() => setTab("otp")}
            className={`rounded-xl py-2 text-sm font-bold transition ${
              tab === "otp" ? "bg-white text-black" : "text-white/60"
            }`}
          >
            Cod email
          </button>
        </div>
      )}

      {error && <ErrorBanner text={error} />}
      {info && !error && <InfoBanner text={info} />}

      {step === "email" && tab === "password" && (
        <form onSubmit={submitPassword} className="space-y-4" noValidate>
          <FieldEmail value={email} onChange={setEmail} />
          <FieldPassword value={password} onChange={setPassword} autoComplete="current-password" />
          <PrimaryButton loading={loading} disabled={!email || !password}>
            Intră în cont
          </PrimaryButton>
          <div className="text-center text-sm">
            <a href="/auth/forgot" className="text-violet-400 hover:underline">Ai uitat parola?</a>
          </div>
        </form>
      )}

      {step === "email" && tab === "otp" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (email.trim()) sendOtp("login");
          }}
          className="space-y-4"
          noValidate
        >
          <FieldEmail value={email} onChange={setEmail} />
          <PrimaryButton loading={loading} disabled={!email.trim()}>
            Trimite cod
          </PrimaryButton>
        </form>
      )}

      {step === "otp_code" && (
        <form onSubmit={submitOtp} className="space-y-4" noValidate>
          {devOtp && <DevOtpBanner code={devOtp} />}
          <FieldOtp value={otp} onChange={setOtp} />
          <PrimaryButton loading={loading} disabled={otp.length !== 6}>
            Confirmă
          </PrimaryButton>
          <div className="flex items-center justify-between pt-2 text-sm">
            <button
              type="button"
              onClick={() => {
                setStep("email");
                setOtp("");
                setError(null);
                setInfo(null);
                setDevOtp(null);
              }}
              className="inline-flex items-center gap-1 text-white/60 hover:text-white transition"
            >
              <ArrowLeft className="h-4 w-4" /> Schimbă emailul
            </button>
            <button
              type="button"
              disabled={resendCooldown > 0 || loading}
              onClick={() => sendOtp("resend_otp")}
              className="font-bold text-white/70 hover:text-white transition disabled:opacity-50"
            >
              {resendCooldown > 0 ? `Retrimite în ${resendCooldown}s` : "Retrimite codul"}
            </button>
          </div>
        </form>
      )}

      <p className="mt-6 text-center text-xs text-white/40">
        Continuând, accepți{" "}
        <Link href="/terms" className="underline hover:text-white/70">Termenii</Link>
        {" "}și{" "}
        <Link href="/privacy" className="underline hover:text-white/70">Politica de confidențialitate</Link>.
      </p>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════
   SIGNUP WIZARD — 4 steps
   ════════════════════════════════════════════════════════════════ */

type SignupData = {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  username: string;
  phone: string;
  avatar_url: string;
};

function SignupWizard({ nextPath }: { nextPath: string }) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [data, setData] = useState<SignupData>({
    email: "",
    password: "",
    first_name: "",
    last_name: "",
    username: "",
    phone: "",
    avatar_url: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usernameStatus, setUsernameStatus] = useState<
    "idle" | "checking" | "available" | "taken" | "invalid"
  >("idle");

  function update<K extends keyof SignupData>(key: K, value: SignupData[K]) {
    setData((d) => ({ ...d, [key]: value }));
  }

  // Live username check (debounced)
  useEffect(() => {
    if (step !== 3) return;
    const handle = data.username.trim().toLowerCase();
    if (!handle) {
      setUsernameStatus("idle");
      return;
    }
    if (!/^[a-z0-9_.]{3,20}$/.test(handle)) {
      setUsernameStatus("invalid");
      return;
    }
    setUsernameStatus("checking");
    const t = setTimeout(async () => {
      try {
        const res = await fetch("/api/auth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "check_username", username: handle }),
        });
        const j = await res.json();
        setUsernameStatus(j.available ? "available" : "taken");
      } catch {
        setUsernameStatus("idle");
      }
    }, 400);
    return () => clearTimeout(t);
  }, [data.username, step]);

  function next() {
    setError(null);
    setStep((s) => s + 1);
  }
  function back() {
    setError(null);
    setStep((s) => Math.max(1, s - 1));
  }

  async function submitFinal() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "signup_password",
          email: data.email.trim().toLowerCase(),
          password: data.password,
          first_name: data.first_name.trim(),
          last_name: data.last_name.trim(),
          username: data.username.trim().toLowerCase(),
          phone: data.phone.trim() || undefined,
          avatar_url: data.avatar_url || undefined,
          next: nextPath || undefined,
        }),
      });
      const j = await res.json();
      if (!res.ok || !j.success) {
        setError(j.error || "Nu am putut crea contul.");
        // Sari înapoi la pasul relevant pentru field-ul cu eroare
        if (j.field === "email") setStep(1);
        else if (j.field === "username") { setStep(3); setUsernameStatus("taken"); }
        else if (j.field === "phone") setStep(4);
        return;
      }
      const target =
        typeof j.redirectTo === "string" && j.redirectTo.startsWith("/")
          ? j.redirectTo
          : nextPath || "/account";
      window.location.assign(target);
      router.refresh();
    } catch {
      setError("Eroare de conexiune.");
    } finally {
      setLoading(false);
    }
  }

  // Validări per-pas
  const canAdvance =
    step === 1
      ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email) && data.password.length >= 8
      : step === 2
        ? data.first_name.trim().length > 0 && data.last_name.trim().length > 0
        : step === 3
          ? usernameStatus === "available"
          : true;

  return (
    <section className="flex flex-1 flex-col">
      <div className="mb-6">
        <p className="text-xs font-bold uppercase tracking-widest text-[#7C3AED]">
          Pas {step} din 4
        </p>
        <h1 className="mt-1 text-3xl font-black tracking-tight sm:text-4xl">
          {step === 1 && "Email + parolă"}
          {step === 2 && "Cum te cheamă?"}
          {step === 3 && "Alege un username"}
          {step === 4 && "Aproape gata"}
        </h1>
        <p className="mt-2 text-sm text-white/60">
          {step === 1 && "Folosim emailul pentru recuperare cont și verificare."}
          {step === 2 && "Acesta apare pe profilul tău public."}
          {step === 3 && "Numele unic — așa te vor găsi prietenii pe Swypik."}
          {step === 4 && "Telefon și avatar sunt opționale. Le poți adăuga oricând."}
        </p>
      </div>

      <ProgressBar step={step} total={4} />

      {error && <ErrorBanner text={error} />}

      {step === 1 && (
        <div className="space-y-4">
          <FieldEmail value={data.email} onChange={(v) => update("email", v)} />
          <FieldPassword
            value={data.password}
            onChange={(v) => update("password", v)}
            autoComplete="new-password"
            hint="Minim 8 caractere"
          />
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <FieldText
            label="Prenume"
            icon={<UserIcon className="h-5 w-5 text-white/40" />}
            value={data.first_name}
            onChange={(v) => update("first_name", v)}
            placeholder="Abel"
            autoComplete="given-name"
          />
          <FieldText
            label="Nume"
            icon={<UserIcon className="h-5 w-5 text-white/40" />}
            value={data.last_name}
            onChange={(v) => update("last_name", v)}
            placeholder="Varga"
            autoComplete="family-name"
          />
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <FieldText
            label="Username"
            icon={<AtSign className="h-5 w-5 text-white/40" />}
            value={data.username}
            onChange={(v) => update("username", v.toLowerCase().replace(/\s/g, ""))}
            placeholder="abel_varga"
            autoComplete="off"
          />
          <UsernameStatus status={usernameStatus} value={data.username} />
        </div>
      )}

      {step === 4 && (
        <div className="space-y-4">
          <FieldText
            label="Telefon (opțional)"
            icon={<Phone className="h-5 w-5 text-white/40" />}
            value={data.phone}
            onChange={(v) => update("phone", v)}
            placeholder="+40712345678"
            autoComplete="tel"
            type="tel"
          />
          <p className="text-xs text-white/40">
            Avatar îl poți adăuga din contul tău după înregistrare.
          </p>
        </div>
      )}

      <div className="mt-6 flex gap-3">
        {step > 1 && (
          <button
            type="button"
            onClick={back}
            className="flex h-14 flex-1 items-center justify-center gap-1 rounded-2xl border border-white/10 bg-white/5 text-sm font-bold text-white/80 transition active:scale-[0.98]"
          >
            <ArrowLeft className="h-4 w-4" /> Înapoi
          </button>
        )}
        {step < 4 ? (
          <button
            type="button"
            onClick={next}
            disabled={!canAdvance}
            className="flex h-14 flex-[2] items-center justify-center rounded-2xl bg-[#7C3AED] text-base font-black text-white transition active:scale-[0.98] disabled:opacity-50"
          >
            Continuă
          </button>
        ) : (
          <button
            type="button"
            onClick={submitFinal}
            disabled={loading}
            className="flex h-14 flex-[2] items-center justify-center rounded-2xl bg-[#7C3AED] text-base font-black text-white transition active:scale-[0.98] disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Creează contul"}
          </button>
        )}
      </div>

      <p className="mt-6 text-center text-xs text-white/40">
        Continuând, accepți{" "}
        <Link href="/terms" className="underline hover:text-white/70">Termenii</Link>
        {" "}și{" "}
        <Link href="/privacy" className="underline hover:text-white/70">Politica de confidențialitate</Link>.
      </p>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════
   Reusable bits
   ════════════════════════════════════════════════════════════════ */

function ErrorBanner({ text }: { text: string }) {
  return (
    <div
      role="alert"
      className="mb-5 flex items-start gap-3 rounded-2xl border border-[#7C3AED]/30 bg-[#7C3AED]/10 p-4"
    >
      <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-[#7C3AED]" />
      <p className="text-sm font-semibold text-white">{text}</p>
    </div>
  );
}

function InfoBanner({ text }: { text: string }) {
  return (
    <div
      role="status"
      className="mb-5 flex items-start gap-3 rounded-2xl border border-[#10A37F]/30 bg-[#10A37F]/10 p-4"
    >
      <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-[#10A37F]" />
      <p className="text-sm font-semibold text-white">{text}</p>
    </div>
  );
}

function DevOtpBanner({ code }: { code: string }) {
  return (
    <div className="mb-2 rounded-2xl border border-[#10A37F]/30 bg-[#10A37F]/10 p-5 text-center">
      <p className="text-[10px] font-black uppercase tracking-widest text-[#10A37F]">
        Cod dev (vizibil doar local)
      </p>
      <p className="mt-1 font-mono text-3xl font-black tracking-[0.4em] text-white">
        {code}
      </p>
    </div>
  );
}

function FieldEmail({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-bold uppercase tracking-widest text-white/60">
        Email
      </span>
      <span className="relative block">
        <Mail className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-white/40" />
        <input
          type="email"
          autoComplete="email"
          inputMode="email"
          spellCheck={false}
          required
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="nume@email.ro"
          className="w-full rounded-2xl border border-white/10 bg-white/[0.04] py-4 pl-12 pr-4 text-base text-white placeholder-white/30 outline-none transition focus:border-[#7C3AED] focus:bg-white/[0.06] focus:ring-2 focus:ring-[#7C3AED]/30"
        />
      </span>
    </label>
  );
}

function FieldPassword({
  value,
  onChange,
  autoComplete,
  hint,
}: {
  value: string;
  onChange: (v: string) => void;
  autoComplete: "current-password" | "new-password";
  hint?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-bold uppercase tracking-widest text-white/60">
        Parolă
      </span>
      <span className="relative block">
        <Lock className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-white/40" />
        <input
          type={show ? "text" : "password"}
          autoComplete={autoComplete}
          required
          minLength={8}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="••••••••"
          className="w-full rounded-2xl border border-white/10 bg-white/[0.04] py-4 pl-12 pr-16 text-base text-white placeholder-white/30 outline-none transition focus:border-[#7C3AED] focus:bg-white/[0.06] focus:ring-2 focus:ring-[#7C3AED]/30"
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 text-xs font-bold text-white/60 hover:bg-white/10 hover:text-white transition"
        >
          {show ? "Ascunde" : "Arată"}
        </button>
      </span>
      {hint && <p className="mt-1.5 text-xs text-white/40">{hint}</p>}
    </label>
  );
}

function FieldText({
  label,
  icon,
  value,
  onChange,
  placeholder,
  autoComplete,
  type = "text",
}: {
  label: string;
  icon: React.ReactNode;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-bold uppercase tracking-widest text-white/60">
        {label}
      </span>
      <span className="relative block">
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2">
          {icon}
        </span>
        <input
          type={type}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-2xl border border-white/10 bg-white/[0.04] py-4 pl-12 pr-4 text-base text-white placeholder-white/30 outline-none transition focus:border-[#7C3AED] focus:bg-white/[0.06] focus:ring-2 focus:ring-[#7C3AED]/30"
        />
      </span>
    </label>
  );
}

function FieldOtp({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const ref = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    const t = setTimeout(() => ref.current?.focus(), 60);
    return () => clearTimeout(t);
  }, []);
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-bold uppercase tracking-widest text-white/60">
        Cod de 6 cifre
      </span>
      <span className="relative block">
        <KeyRound className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-white/40" />
        <input
          ref={ref}
          type="text"
          autoComplete="one-time-code"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={6}
          required
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
          placeholder="000000"
          className="w-full rounded-2xl border border-white/10 bg-white/[0.04] py-4 pl-12 pr-4 text-center font-mono text-2xl font-black tracking-[0.5em] text-white placeholder-white/20 outline-none transition focus:border-[#7C3AED] focus:bg-white/[0.06] focus:ring-2 focus:ring-[#7C3AED]/30"
        />
      </span>
    </label>
  );
}

function PrimaryButton({
  loading,
  disabled,
  children,
}: {
  loading: boolean;
  disabled: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="submit"
      disabled={loading || disabled}
      className="flex h-14 w-full items-center justify-center rounded-2xl bg-[#7C3AED] text-base font-black text-white transition active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100"
    >
      {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : children}
    </button>
  );
}

function ProgressBar({ step, total }: { step: number; total: number }) {
  return (
    <div className="mb-6 flex gap-2">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`h-1.5 flex-1 rounded-full transition ${
            i < step ? "bg-[#7C3AED]" : "bg-white/10"
          }`}
        />
      ))}
    </div>
  );
}

function UsernameStatus({
  status,
  value,
}: {
  status: "idle" | "checking" | "available" | "taken" | "invalid";
  value: string;
}) {
  if (!value.trim()) return null;
  if (status === "checking") {
    return <p className="text-xs text-white/40">Verificăm disponibilitatea...</p>;
  }
  if (status === "invalid") {
    return (
      <p className="text-xs text-[#7C3AED]">
        3-20 caractere, doar litere mici, cifre, _ sau .
      </p>
    );
  }
  if (status === "available") {
    return (
      <p className="flex items-center gap-1 text-xs text-[#10A37F]">
        <CheckCircle2 className="h-3.5 w-3.5" /> @{value} este disponibil
      </p>
    );
  }
  if (status === "taken") {
    return (
      <p className="flex items-center gap-1 text-xs text-[#7C3AED]">
        <AlertCircle className="h-3.5 w-3.5" /> @{value} este deja folosit
      </p>
    );
  }
  return null;
}
