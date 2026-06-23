"use client";

/**
 * Pi login self-diagnostic page — `/debug/pi`.
 *
 * Shows the runtime state of the Pi SDK in the visitor's browser so a
 * non-technical user can copy-paste relevant information when reporting
 * "Conectare esuata". Also pulls the last 50 diagnostic entries we
 * collected server-side from any browser that hit the login button.
 *
 * Deliberately public (no auth) — the data exposed is metadata only,
 * no tokens or emails. Anyone who can land on /auth/login can already
 * see all of this in their own DevTools.
 */

import { useCallback, useEffect, useState } from "react";

type ClientFacts = {
  ua: string;
  isPiBrowser: boolean;
  windowPiPresent: boolean;
  walletModulePresent: boolean;
  sandbox: boolean;
  authPiAuth: boolean;
  lastClientDiag: string | null;
};

type ServerEntry = {
  ts: string;
  stage: string;
  ua: string;
  sandbox: boolean;
  sdkPresent: boolean;
  walletModule: boolean;
  scopes: string[];
  ip?: string;
  [k: string]: unknown;
};

function gatherClientFacts(): ClientFacts {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const sandbox = process.env.NEXT_PUBLIC_PI_SANDBOX === "1";
  const authPiAuth = process.env.NEXT_PUBLIC_FEATURE_PI_AUTH !== "0";
  let lastClientDiag: string | null = null;
  try {
    lastClientDiag = window.localStorage.getItem("swypik:pi:lastDiag");
  } catch {
    // localStorage may be unavailable in private mode.
  }
  return {
    ua,
    isPiBrowser: /PiBrowser/i.test(ua),
    windowPiPresent: typeof window !== "undefined" && Boolean(window.Pi),
    walletModulePresent:
      typeof window !== "undefined" && Boolean(window.Pi?.Wallet),
    sandbox,
    authPiAuth,
    lastClientDiag,
  };
}

export default function DebugPiPage() {
  const [facts, setFacts] = useState<ClientFacts | null>(null);
  const [serverEntries, setServerEntries] = useState<ServerEntry[]>([]);
  const [serverLoading, setServerLoading] = useState(true);
  const [serverError, setServerError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  // Refresh client facts every 500ms while the SDK is still loading so
  // the table reflects window.Pi appearing.
  useEffect(() => {
    setFacts(gatherClientFacts());
    const id = window.setInterval(() => {
      setFacts(gatherClientFacts());
    }, 500);
    // Stop polling once SDK is detected.
    const stopId = window.setTimeout(() => window.clearInterval(id), 8000);
    return () => {
      window.clearInterval(id);
      window.clearTimeout(stopId);
    };
  }, []);

  const loadServerEntries = useCallback(async () => {
    setServerLoading(true);
    setServerError(null);
    try {
      const r = await fetch("/api/debug/pi-error", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok || !j.ok) {
        setServerError(j.error || `HTTP ${r.status}`);
      } else {
        setServerEntries(j.entries || []);
      }
    } catch (e) {
      setServerError(e instanceof Error ? e.message : "fetch failed");
    } finally {
      setServerLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadServerEntries();
  }, [loadServerEntries]);

  const runTest = useCallback(async () => {
    setTesting(true);
    setTestResult(null);
    const result: string[] = [];
    result.push(`UA: ${navigator.userAgent}`);
    result.push(`window.Pi: ${typeof window.Pi}`);
    if (!window.Pi) {
      result.push(
        "REZULTAT: Pi SDK lipseste (esti in afara Pi Browser sau script-ul nu s-a incarcat).",
      );
      setTestResult(result.join("\n"));
      setTesting(false);
      return;
    }
    try {
      const initStart = Date.now();
      await window.Pi.init({ version: "2.0", sandbox: facts?.sandbox ?? false });
      result.push(`Pi.init OK in ${Date.now() - initStart}ms`);
    } catch (e) {
      result.push(`Pi.init ESEC: ${e instanceof Error ? e.message : String(e)}`);
      setTestResult(result.join("\n"));
      setTesting(false);
      return;
    }
    try {
      const authStart = Date.now();
      const auth = await window.Pi.authenticate(["username"], (p) => {
        result.push(`incomplete payment: ${p.identifier}`);
      });
      result.push(
        `Pi.authenticate OK in ${Date.now() - authStart}ms — user=${auth.user?.username || "?"}`,
      );
      result.push("REZULTAT: auth a reusit. Daca login real esueaza, problema e in backend.");
    } catch (e) {
      result.push(
        `Pi.authenticate ESEC: ${e instanceof Error ? e.message : String(e)}`,
      );
      result.push("REZULTAT: Pi a respins authenticate. Verifica scope-uri in Pi Developer Portal.");
    }
    setTestResult(result.join("\n"));
    setTesting(false);
  }, [facts]);

  if (!facts) {
    return (
      <div className="min-h-screen bg-[#0D0D0D] p-6 text-white">
        <p>Se incarca...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0D0D0D] p-6 text-white">
      <h1 className="mb-6 text-2xl font-black">Pi login diagnostic</h1>

      <section className="mb-6 rounded-2xl border border-white/10 bg-[#1A1A1A] p-4">
        <h2 className="mb-3 text-sm font-black uppercase tracking-wider text-white/70">
          Browser-ul tau acum
        </h2>
        <table className="w-full text-xs">
          <tbody>
            <Row k="User-Agent" v={facts.ua} mono />
            <Row k="Detect Pi Browser?" v={facts.isPiBrowser ? "DA" : "NU"} />
            <Row k="window.Pi prezent?" v={facts.windowPiPresent ? "DA" : "NU"} />
            <Row
              k="window.Pi.Wallet prezent?"
              v={facts.walletModulePresent ? "DA" : "NU"}
            />
            <Row
              k="NEXT_PUBLIC_PI_SANDBOX"
              v={facts.sandbox ? "1 (sandbox)" : "0 (mainnet)"}
            />
            <Row k="NEXT_PUBLIC_FEATURE_PI_AUTH" v={facts.authPiAuth ? "1" : "0"} />
            <Row
              k="Ultima diagnoza locala"
              v={facts.lastClientDiag || "(niciuna)"}
              mono
            />
          </tbody>
        </table>
      </section>

      <section className="mb-6 rounded-2xl border border-white/10 bg-[#1A1A1A] p-4">
        <h2 className="mb-3 text-sm font-black uppercase tracking-wider text-white/70">
          Test live Pi.authenticate
        </h2>
        <p className="mb-3 text-xs text-white/60">
          Apasa butonul de jos. Daca esti in Pi Browser, va aparea dialogul Pi de consimtamant.
          Daca esti in alt browser, vei vedea ca SDK-ul lipseste.
        </p>
        <button
          type="button"
          onClick={runTest}
          disabled={testing}
          className="rounded-xl bg-[#7C3AED] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#6D28D9] disabled:opacity-60"
        >
          {testing ? "Rulez..." : "Ruleaza testul"}
        </button>
        {testResult ? (
          <pre className="mt-3 max-h-64 overflow-auto rounded-lg bg-black/40 p-3 text-[11px] leading-snug text-white/90 whitespace-pre-wrap">
            {testResult}
          </pre>
        ) : null}
      </section>

      <section className="rounded-2xl border border-white/10 bg-[#1A1A1A] p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-black uppercase tracking-wider text-white/70">
            Ultimele 50 atempturi (toti userii)
          </h2>
          <button
            type="button"
            onClick={() => void loadServerEntries()}
            className="text-xs underline text-white/60 hover:text-white/90"
          >
            refresh
          </button>
        </div>
        {serverLoading ? (
          <p className="text-xs text-white/50">Se incarca...</p>
        ) : serverError ? (
          <p className="text-xs text-red-400">Eroare: {serverError}</p>
        ) : serverEntries.length === 0 ? (
          <p className="text-xs text-white/50">
            Niciun atempt inca. Apasa butonul Pi de pe /auth/login si revino aici.
          </p>
        ) : (
          <div className="space-y-2">
            {serverEntries.map((e, i) => (
              <details
                key={`${e.ts}-${i}`}
                className="rounded-lg border border-white/5 bg-black/30 p-2 text-xs"
              >
                <summary className="cursor-pointer">
                  <span
                    className={
                      e.stage === "success"
                        ? "text-emerald-400"
                        : e.stage === "no_sdk"
                          ? "text-amber-400"
                          : "text-red-400"
                    }
                  >
                    [{e.stage}]
                  </span>{" "}
                  <span className="text-white/60">{e.ts}</span>{" "}
                  <span className="text-white/40">
                    sandbox={String(e.sandbox)} sdk={String(e.sdkPresent)}
                  </span>
                </summary>
                <pre className="mt-2 overflow-auto whitespace-pre-wrap break-all text-[10px] text-white/70">
                  {JSON.stringify(e, null, 2)}
                </pre>
              </details>
            ))}
          </div>
        )}
      </section>

      <p className="mt-6 text-center text-[10px] text-white/30">
        Datele se sterg automat dupa 24h. Nu se salveaza tokenuri sau email-uri.
      </p>
    </div>
  );
}

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <tr className="border-t border-white/5">
      <td className="py-1.5 pr-3 text-white/60">{k}</td>
      <td className={`py-1.5 break-all ${mono ? "font-mono text-[11px]" : ""}`}>
        {v}
      </td>
    </tr>
  );
}
