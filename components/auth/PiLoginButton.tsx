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

type PiUser = { uid: string; username: string };
type PiAuthResult = { accessToken: string; user: PiUser };
type PiIncompletePayment = { identifier: string; transaction?: { txid?: string } };

type PiSdk = {
  // Pi SDK 2.0: init returns a Promise that resolves once the bridge to the
  // Pi Browser is ready. Older builds returned void; we coerce both via
  // Promise.resolve(...) at the call site.
  init: (opts: { version: "2.0"; sandbox?: boolean }) => Promise<void> | void;
  authenticate: (
    scopes: string[],
    onIncompletePaymentFound: (payment: PiIncompletePayment) => void,
  ) => Promise<PiAuthResult>;
};

declare global {
  interface Window {
    Pi?: PiSdk;
  }
}

type Props = {
  scopes?: string[];
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
  scopes = ["username"],
  redirectTo = "/",
  className,
  label = "Continua cu Pi Network",
  autoTrigger = true,
  silent = false,
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

    // Default visibility: show inside Pi Browser or under the sandbox flag.
    // (We'll flip to true above if window.Pi shows up later from any UA.)
    setVisible(sandbox || isPiBrowser());

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
      setError("Pi SDK indisponibil. Deschide app-ul in Pi Browser.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      // Defensive: if the button is clicked before the init effect resolved,
      // run init now (with a timeout) and proceed regardless. Pi.authenticate
      // must be reachable as soon as possible — Pi's app verifier checks for it.
      if (!sdkReady) {
        await withTimeout(window.Pi.init({ version: "2.0", sandbox }), 2000);
        setSdkReady(true);
      }
      const auth = await window.Pi.authenticate(scopes, (payment) => {
        // Required by the SDK. When payments are wired up later, resolve here.
        // eslint-disable-next-line no-console
        console.warn("[pi] incomplete payment found", payment.identifier);
      });

      const res = await fetch("/api/auth/pi", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          accessToken: auth.accessToken,
          user: auth.user,
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
  useEffect(() => {
    if (!autoTrigger) return;
    if (!enabled || !visible || !sdkReady) return;
    if (autoAttempted || loading) return;
    if (alreadySignedIn) return;
    setAutoAttempted(true);
    void handleLogin();
  }, [autoTrigger, enabled, visible, sdkReady, autoAttempted, loading, alreadySignedIn, handleLogin]);

  if (!enabled || !visible) return null;
  if (silent) return null;

  return (
    <div className={className}>
      <button
        type="button"
        onClick={handleLogin}
        disabled={!sdkReady || loading}
        className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-[#7C3AED] px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#6D28D9] disabled:opacity-60"
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
              : "Conectare esuata."}
        </p>
      ) : null}
    </div>
  );
}
