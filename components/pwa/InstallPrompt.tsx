"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Smartphone, X } from "lucide-react";

const DISMISS_KEY = "swypik_pwa_dismissed";
const DISMISS_AT_KEY = "swypik_pwa_dismissed_at";
const REPROMPT_MS = 14 * 24 * 60 * 60 * 1000;
const HIDE_PREFIXES = ["/auth", "/admin", "/onboarding", "/seller/login"];

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

/**
 * PWA install banner — sticky bottom-LEFT (PushPrompt occupies bottom-right).
 * Listens for beforeinstallprompt, surfaces banner, hides after dismissal
 * for 14 days. Hidden on auth/admin/onboarding routes.
 */
export default function InstallPrompt() {
  const pathname = usePathname() || "/";
  const [evt, setEvt] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (HIDE_PREFIXES.some((p) => pathname.startsWith(p))) return;
    try {
      if (window.localStorage.getItem(DISMISS_KEY) === "1") {
        const at = Number(window.localStorage.getItem(DISMISS_AT_KEY) || "0");
        if (at && Date.now() - at < REPROMPT_MS) return;
      }
    } catch {
      /* no-op */
    }

    const onBefore = (e: Event) => {
      e.preventDefault();
      setEvt(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    const onInstalled = () => {
      setVisible(false);
      setEvt(null);
    };
    window.addEventListener("beforeinstallprompt", onBefore);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBefore);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, [pathname]);

  const dismiss = useCallback(() => {
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
      window.localStorage.setItem(DISMISS_AT_KEY, String(Date.now()));
    } catch {
      /* no-op */
    }
    setVisible(false);
  }, []);

  const install = useCallback(async () => {
    if (!evt) return;
    setBusy(true);
    try {
      await evt.prompt();
      const choice = await evt.userChoice;
      if (choice.outcome === "accepted") {
        setVisible(false);
        setEvt(null);
      } else {
        dismiss();
      }
    } catch {
      /* no-op */
    } finally {
      setBusy(false);
    }
  }, [evt, dismiss]);

  if (!visible || !evt) return null;

  return (
    <div
      role="dialog"
      aria-labelledby="pwa-install-title"
      className="fixed left-3 right-3 z-[60] sm:left-4 sm:right-auto sm:max-w-sm"
      style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 72px)" }}
    >
      <div className="relative flex items-start gap-3 rounded-2xl border border-[#7C3AED]/40 bg-gradient-to-br from-[#1a0b2e] to-[#0a0a0a] p-4 shadow-2xl shadow-[#7C3AED]/20 backdrop-blur">
        <span className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-[#7C3AED]/30 text-white">
          <Smartphone size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <p id="pwa-install-title" className="text-sm font-black text-white">
            Instalează aplicația
          </p>
          <p className="mt-0.5 text-xs text-white/70">
            Adaugă Swypik pe ecranul principal pentru acces rapid și experiență nativă.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={install}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#7C3AED] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#6d28d9] disabled:opacity-60"
            >
              <Smartphone size={12} />
              {busy ? "Se instalează…" : "Instalează"}
            </button>
            <button
              type="button"
              onClick={dismiss}
              className="rounded-lg px-3 py-1.5 text-xs font-bold text-white/70 hover:bg-white/5 hover:text-white"
            >
              Mai târziu
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Închide"
          className="absolute right-2 top-2 rounded-full p-1 text-white/50 hover:bg-white/10 hover:text-white"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
