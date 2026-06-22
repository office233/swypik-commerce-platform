"use client";

/**
 * Pi Network login button.
 *
 * Renders only when running inside the Pi Browser (or when sandbox mode is
 * enabled via NEXT_PUBLIC_PI_SANDBOX=1). Calls `window.Pi.authenticate`, then
 * exchanges the `accessToken` for a Swypik session via POST /api/auth/pi.
 *
 * Reference: https://pi-apps.github.io/pi-sdk-docs/quick-start/genai/Authentication
 */

import { useCallback, useEffect, useState } from "react";
import { CLIENT_FEATURES } from "@/lib/feature-flags-client";

// Pi SDK types + the single global Window.Pi declaration live in lib/pi/types.
import type { PiAuthResult, PiScope } from "@/lib/pi/types";
import "@/lib/pi/types";

type Props = {
  scopes?: PiScope[];
  redirectTo?: string;
  className?: string;
  label?: string;
  /** Auto-trigger Pi.authenticate when the SDK is ready and the user is not
   *  already signed in. Default: true. The manual button still renders so the
   *  user can retry if the auto-attempt is cancelled or blocked. */
  autoTrigger?: boolean;
  /** When true, the component runs the auto-trigger / session check but does
   *  not render any UI. Use this for the global mount in `app/layout.tsx` so
   *  every page in Pi Browser attempts auto-login. */
  silent?: boolean;
  /** When true, always render the button (even outside Pi Browser) with a
   *  helpful CTA pointing to Pi Browser. Used on the public swypik.com login
   *  and signup pages so non-Pioneers can discover Pi as a sign-in option.
   *  Default: false (preserves the legacy Pi-Browser-only behaviour used
   *  by the `pi.swypik.com` shell). */
  showOutsidePiBrowser?: boolean;
  onSuccess?: (user: { id: string; piUid: string; piUsername: string }) => void;
};

function isPiBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  return /PiBrowser/i.test(navigator.userAgent);
}

/** Race a promise against a timeout. Resolves to `null` if the timeout fires
 *  first. We use this around Pi.init because Pi's own app-verifier sometimes
 *  injects a mock SDK whose init never resolves; we still want to call
 *  Pi.authenticate so the verifier detects the call. */
function withTimeout<T>(p: Promise<T> | T, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    let done = false;
    const t = setTimeout(() => {
      if (!done) {
        done = true;
        resolve(null);
      }
    }, ms);
    Promise.resolve(p)
      .then((v) => {
        if (!done) {
          done = true;
          clearTimeout(t);
          resolve(v);
        }
      })
      .catch(() => {
        if (!done) {
          done = true;
          clearTimeout(t);
          resolve(null);
        }
      });
  });
}

export default function PiLoginButton({
  scopes = ["username", "wallet_address"],
  redirectTo = "/",
  className,
  label = "Continua cu Pi Network",
  autoTrigger = true,
  silent = false,
  showOutsidePiBrowser = false,
  onSuccess,
}: Props) {
  const sandbox = CLIENT_FEATURES.piSandbox;
  const enabled = CLIENT_FEATURES.piAuth;

  const [sdkReady, setSdkReady] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [visible, setVisible] = useState<boolean>(false);
  const [autoAttempted, setAutoAttempted] = useState<boolean>(false);
  const [alreadySignedIn, setAlreadySignedIn] = useState<boolean>(false);

  // Wait for window.Pi to be available (script is injected by app/layout.tsx),
  // then call Pi.init(...). We mark the SDK ready as soon as window.Pi exists
  // and kick off init in the background — Pi's own app verifier sometimes
  // injects a mock SDK whose init promise never resolves, but it still
  // expects Pi.authenticate to be called. Treating the SDK as ready the
  // moment window.Pi exists guarantees the verifier sees the call.
  useEffect(() => {
    if (!enabled) return;
    // Render whenever the Pi SDK script has loaded (verifier may not set
    // a PiBrowser UA), or when sandbox flag forces it for local testing.
    if (typeof window === "undefined") return;

    let cancelled = false;
    let interval: number | null = null;

    const initSdk = (): void => {
      if (!window.Pi) return;
      setVisible(true);
      // Mark ready immediately so auto-trigger can fire; race init with a
      // 2s timeout so we never block on a stuck promise from a mock SDK.
      setSdkReady(true);
      void withTimeout(window.Pi.init({ version: "2.0", sandbox }), 2000).then(
        () => {
          if (cancelled) return;
          // no-op: sdkReady is already true.
        },
      );
    };

    // Default visibility: show inside Pi Browser, under sandbox, or whenever
    // the caller explicitly opts into the public-marketing presentation.
    // (We'll flip to true above if window.Pi shows up later from any UA.)
    setVisible(sandbox || isPiBrowser() || showOutsidePiBrowser);

    if (window.Pi) {
      initSdk();
      return () => {
        cancelled = true;
      };
    }

    interval = window.setInterval(() => {
      if (window.Pi) {
        if (interval !== null) {
          window.clearInterval(interval);
          interval = null;
        }
        initSdk();
      }
    }, 200);

    return () => {
      cancelled = true;
      if (interval !== null) window.clearInterval(interval);
    };
  }, [enabled, sandbox]);

  const handleLogin = useCallback(async () => {
    if (!window.Pi) {
      // Outside Pi Browser the SDK never loads. Tell the user how to recover
      // instead of throwing a cryptic message.
      setError(
        "Pi SDK indisponibil. Deschide pi.swypik.com in Pi Browser pentru a continua cu Pi Network.",
      );
      return;
    }
    setError(null);
    setLoading(true);
    try {
      // Per Pi SDK docs: Pi.init returns a Promise; await it FULLY before
      // calling Pi.authenticate. We always await init here (idempotent in the
      // SDK) so authenticate never runs against a half-initialized bridge.
      // A generous 8s timeout guards against a stuck mock SDK injected by the
      // app verifier, without truncating a real (slower) Pi Browser init.
      await withTimeout(window.Pi.init({ version: "2.0", sandbox }), 8000);
      setSdkReady(true);
      const auth = await window.Pi.authenticate(scopes, (payment) => {
        // Required by the SDK. When payments are wired up later, resolve here.
        // eslint-disable-next-line no-console
        console.warn("[pi] incomplete payment found", payment.identifier);
      });

      // After authenticate, ask the SDK for the user's migrated wallet
      // addresses. Requires the `wallet_address` scope to have been granted.
      // Pi only exposes this through the in-browser SDK — there is no
      // server-side endpoint for it, so we capture it client-side and forward
      // the public key to our backend for persistence.
      let walletAddress: string | null = null;
      if (window.Pi?.Wallet?.getUserMigratedWalletAddresses) {
        try {
          const walletInfo = await withTimeout(
            window.Pi.Wallet.getUserMigratedWalletAddresses(),
            4000,
          );
          const primary = walletInfo?.wallets?.[0]?.publicKey;
          if (typeof primary === "string" && primary.startsWith("G") && primary.length >= 50) {
            walletAddress = primary;
          }
        } catch {
          // Wallet read is best-effort; we do not block sign-in on it.
        }
      }

      const res = await fetch("/api/auth/pi", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          accessToken: auth.accessToken,
          user: auth.user,
          walletAddress,
        }),
      });
      const json = (await res.json()) as
        | { ok: true; user: { id: string; piUid: string; piUsername: string } }
        | { ok: false; error: string };

      if (!res.ok || !("ok" in json) || !json.ok) {
        const reason = ("error" in json && json.error) || `http_${res.status}`;
        throw new Error(reason);
      }

      onSuccess?.(json.user);
      if (redirectTo) window.location.assign(redirectTo);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "pi_login_failed";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [scopes, redirectTo, onSuccess, sdkReady, sandbox]);

  // Detect existing Swypik session so we skip auto-trigger for already-signed-in users.
  useEffect(() => {
    if (!enabled || !visible) return;
    let cancelled = false;
    fetch("/api/auth", { credentials: "include", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { authenticated?: boolean } | null) => {
        if (!cancelled && j?.authenticated) setAlreadySignedIn(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [enabled, visible]);

  // Auto-trigger Pi.authenticate as soon as the SDK is ready. We intentionally
  // do NOT wait for the session-check fetch \u2014 Pi's app verifier expects
  // Pi.authenticate to be called within a short window after page load, and
  // the backend safely handles a re-authentication for an existing session.
  //
  // Exception: when the button is rendered on a public login page via
  // showOutsidePiBrowser, we never auto-trigger. The Pi consent dialog should
  // only ever appear in response to a deliberate user click.
  useEffect(() => {
    if (!autoTrigger || showOutsidePiBrowser) return;
    if (!enabled || !visible || !sdkReady) return;
    if (autoAttempted || loading) return;
    if (alreadySignedIn) return;
    setAutoAttempted(true);
    void handleLogin();
  }, [autoTrigger, showOutsidePiBrowser, enabled, visible, sdkReady, autoAttempted, loading, alreadySignedIn, handleLogin]);

  if (!enabled || !visible) return null;
  if (silent) return null;

  // When the SDK is missing (non Pi Browser context, showOutsidePiBrowser=true)
  // we keep the button visible but turn it into a hand-off CTA pointing the
  // user to pi.swypik.com inside Pi Browser. Same visual weight as the SDK
  // button so the option doesn't look broken.
  const sdkAvailable = typeof window !== "undefined" && Boolean(window.Pi);
  const showHandoff = showOutsidePiBrowser && !sdkAvailable;

  if (showHandoff) {
    return (
      <div className={className}>
        <a
          href="https://pi.swypik.com/"
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#7C3AED] px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-[#6D28D9]"
          aria-label="Continua cu Pi Network (deschide in Pi Browser)"
        >
          <span aria-hidden className="text-lg leading-none">π</span>
          <span>{label}</span>
        </a>
        <p className="mt-2 text-center text-[11px] leading-snug text-white/55">
          Deschide pi.swypik.com in Pi Browser ca sa te autentifici cu Pi Network.
        </p>
      </div>
    );
  }

  return (
    <div className={className}>
      <button
        type="button"
        onClick={handleLogin}
        disabled={!sdkReady || loading}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#7C3AED] px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-[#6D28D9] disabled:opacity-60"
      >
        <span aria-hidden className="text-lg leading-none">π</span>
        <span>{loading ? "Se conecteaza..." : label}</span>
      </button>
      {error ? (
        <p className="mt-2 text-xs text-red-500" role="alert">
          {error === "pi_verification_failed"
            ? "Pi nu a putut verifica token-ul. Reincearca."
            : error === "rate_limited"
              ? "Prea multe incercari. Asteapta cateva minute."
              : error.startsWith("Pi SDK indisponibil")
                ? error
                : "Conectare esuata."}
        </p>
      ) : null}
    </div>
  );
}
