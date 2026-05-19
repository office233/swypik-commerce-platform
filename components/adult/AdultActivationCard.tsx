/* eslint-disable react/no-unescaped-entities */
"use client";

/**
 * Activation card for Swypik After Dark (the 18+ surface), rendered
 * inside the user's preferences page on swypik.com.
 *
 * On click:
 *   1) POSTs /api/auth/adult-handoff to mint a single-use token.
 *   2) Receives a https://18.swypik.com/welcome?h=<token> URL.
 *   3) Navigates the browser to that URL.
 *      The /welcome page consumes the token and sets a session cookie
 *      on 18.swypik.com, then bounces to /adult.
 */

import { useState } from "react";

export default function AdultActivationCard() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  async function activate() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/adult-handoff", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ next: "/adult" }),
      });
      if (res.status === 401) {
        window.location.href = "/auth?next=/account/preferences%23adult";
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || `HTTP ${res.status}`);
      }
      const { url } = (await res.json()) as { url: string };
      window.location.href = url;
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <section
      id="adult"
      className="mt-8 rounded-xl border border-rose-900/40 bg-rose-950/20 p-5"
    >
      <h2 className="text-base font-semibold text-rose-200 mb-2">
        Swypik 18+ &mdash; After Dark
      </h2>
      <p className="text-sm text-white/70 leading-relaxed">
        A separate, adults-only side of Swypik. Lives at{" "}
        <span className="text-rose-200">18.swypik.com</span>. Different feed,
        different rules, different payments. You must be 18+ and complete an
        identity check (Veriff) before viewing any content.
      </p>
      <p className="text-xs text-white/40 mt-2 leading-relaxed">
        Activating it does not change your main Swypik account. You can read the
        separate{" "}
        <a
          href="https://18.swypik.com/adult/terms"
          target="_blank"
          rel="noopener noreferrer"
          className="underline text-rose-300"
        >
          Terms
        </a>{" "}
        and{" "}
        <a
          href="https://18.swypik.com/adult/privacy"
          target="_blank"
          rel="noopener noreferrer"
          className="underline text-rose-300"
        >
          Privacy Policy
        </a>{" "}
        first.
      </p>

      <label className="mt-4 flex items-start gap-2 text-xs text-white/70">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          className="mt-0.5"
        />
        <span>
          I confirm I am at least 18 years old and I accept the separate Terms
          of Service for Swypik After Dark.
        </span>
      </label>

      <button
        type="button"
        onClick={activate}
        disabled={!confirmed || busy}
        className="mt-4 inline-flex items-center justify-center rounded-full bg-rose-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:bg-rose-900/40 disabled:text-white/40"
      >
        {busy ? "Opening…" : "Open Swypik After Dark"}
      </button>

      {error && (
        <p className="mt-3 text-xs text-rose-300">
          Could not open: {error}. Try again or contact support.
        </p>
      )}
    </section>
  );
}
