"use client";

import { useEffect, useState } from "react";
import { Link } from "@/lib/i18n/navigation";

type Consent = {
  essential: true;
  analytics: boolean;
  marketing: boolean;
  ts: number;
};

const STORAGE_KEY = "swypik_cookie_consent";

function readConsent(): Consent | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && parsed.essential) return parsed as Consent;
    return null;
  } catch {
    return null;
  }
}

function writeConsent(consent: Consent) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(consent));
  } catch {
    /* noop */
  }
  try {
    window.dispatchEvent(new CustomEvent("swypik:consent", { detail: consent }));
  } catch {
    /* noop */
  }
}

export default function CookieBanner() {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [isEU, setIsEU] = useState(true);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (readConsent()) return;

    let cancelled = false;
    setVisible(true);

    fetch("/api/geo", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { isEU?: boolean }) => {
        if (cancelled) return;
        const eu = j?.isEU !== false;
        setIsEU(eu);
        // Non-EU: defaults ON (opt-out). EU: defaults OFF (opt-in).
        if (!eu) {
          setAnalytics(true);
          setMarketing(true);
        }
      })
      .catch(() => {
        if (!cancelled) setIsEU(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (!mounted || !visible) return null;

  const persist = (a: boolean, m: boolean) => {
    writeConsent({ essential: true, analytics: a, marketing: m, ts: Date.now() });
    setVisible(false);
  };

  const acceptAll = () => persist(true, true);
  const onlyEssential = () => persist(false, false);
  const saveCustom = () => persist(analytics, marketing);

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="cookie-banner-title"
      className="fixed inset-x-0 bottom-[76px] md:bottom-0 z-40 px-3 pb-3 pointer-events-none"
      style={{ paddingBottom: "max(env(safe-area-inset-bottom, 12px), 12px)" }}
    >
      <div className="pointer-events-auto mx-auto w-full max-w-2xl rounded-2xl border border-neutral-800 bg-neutral-950/95 backdrop-blur p-4 shadow-2xl text-sm text-neutral-100">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <h2 id="cookie-banner-title" className="font-semibold text-base mb-1">
              Cookie-uri & confidențialitate
            </h2>
            <p className="text-neutral-300 leading-snug">
              Folosim cookie-uri necesare pentru funcționarea Swypik. Cu acordul tău activăm și
              cookies analitice și de marketing pentru a îmbunătăți experiența.
              {isEU ? " Conform GDPR, ai nevoie să optezi explicit." : ""}
            </p>

            {showDetails && (
              <div className="mt-3 space-y-2">
                <ToggleRow
                  label="Necesare"
                  description="Autentificare, sesiune, securitate. Nu pot fi dezactivate."
                  checked
                  locked
                />
                <ToggleRow
                  label="Analitice"
                  description="Statistici de utilizare anonimizate."
                  checked={analytics}
                  onChange={setAnalytics}
                />
                <ToggleRow
                  label="Marketing"
                  description="Personalizare conținut și măsurare campanii."
                  checked={marketing}
                  onChange={setMarketing}
                />
              </div>
            )}

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={acceptAll}
                className="px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white font-medium"
              >
                Acceptă toate
              </button>
              <button
                type="button"
                onClick={onlyEssential}
                className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-white font-medium"
              >
                Doar necesare
              </button>
              {showDetails ? (
                <button
                  type="button"
                  onClick={saveCustom}
                  className="px-3 py-1.5 rounded-lg border border-neutral-700 hover:bg-neutral-800 text-neutral-100"
                >
                  Salvează preferințele
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowDetails(true)}
                  className="px-3 py-1.5 rounded-lg border border-neutral-700 hover:bg-neutral-800 text-neutral-100"
                >
                  Setări detaliate
                </button>
              )}
              <Link
                href="/legal/cookies"
                className="px-3 py-1.5 text-neutral-400 hover:text-neutral-200 underline-offset-2 hover:underline"
              >
                Află mai multe
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
  locked,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange?: (v: boolean) => void;
  locked?: boolean;
}) {
  return (
    <label className="flex items-start gap-3 p-2 rounded-lg bg-neutral-900/60">
      <input
        type="checkbox"
        className="mt-1 h-4 w-4 accent-violet-600"
        checked={checked}
        disabled={locked}
        onChange={(e) => onChange?.(e.target.checked)}
        aria-label={label}
      />
      <span className="flex-1">
        <span className="block font-medium">{label}</span>
        <span className="block text-xs text-neutral-400">{description}</span>
      </span>
    </label>
  );
}
