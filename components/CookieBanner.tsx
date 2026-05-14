"use client";

import { useEffect, useState } from "react";

const COOKIE_NAME = "cookie_consent";

type ConsentValue = "accepted" | "rejected" | null;

function readConsent(): ConsentValue {
  if (typeof document === "undefined") return null;
  const match = document.cookie.split("; ").find((c) => c.startsWith(`${COOKIE_NAME}=`));
  if (!match) return null;
  const value = decodeURIComponent(match.split("=")[1] || "");
  return value === "accepted" || value === "rejected" ? value : null;
}

function writeConsent(value: "accepted" | "rejected") {
  if (typeof document === "undefined") return;
  const oneYear = 60 * 60 * 24 * 365;
  document.cookie = `${COOKIE_NAME}=${value}; Max-Age=${oneYear}; Path=/; SameSite=Lax`;
}

export default function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (readConsent() === null) setVisible(true);
  }, []);

  if (!visible) return null;

  const handle = (value: "accepted" | "rejected") => {
    writeConsent(value);
    setVisible(false);
  };

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label="Cookie consent"
      className="fixed inset-x-0 bottom-0 z-[100] px-3 pb-[calc(env(safe-area-inset-bottom)+64px)] sm:pb-3 pointer-events-none"
    >
      <div className="pointer-events-auto max-w-xl mx-auto bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-2xl p-4 text-sm">
        <p className="text-neutral-700 dark:text-neutral-200 mb-3">
          Folosim cookies esentiale pentru autentificare si plati. Pentru analitice agregate cerem acordul tau.
          Vezi <a href="/legal/cookies" className="underline">politica de cookies</a>.
        </p>
        <div className="flex gap-2 justify-end">
          <button
            onClick={() => handle("rejected")}
            className="px-3 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300"
          >
            Doar esentiale
          </button>
          <button
            onClick={() => handle("accepted")}
            className="px-3 py-1.5 rounded-lg bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 font-medium"
          >
            Accept toate
          </button>
        </div>
      </div>
    </div>
  );
}
