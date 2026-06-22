"use client";

import { useEffect } from "react";
import { CLIENT_FEATURES } from "@/lib/feature-flags-client";

/**
 * Initializes the Pi SDK once on mount. Must run before any authenticate /
 * createPayment call. Sandbox mode is driven by NEXT_PUBLIC_PI_SANDBOX so we
 * can test on Pi Testnet before Mainnet listing.
 */
export default function PiAppInit() {
  useEffect(() => {
    let cancelled = false;
    const tryInit = (attempt: number) => {
      if (cancelled) return;
      const Pi = (window as unknown as { Pi?: { init: (o: { version: "2.0"; sandbox?: boolean }) => Promise<void> | void } }).Pi;
      if (Pi) {
        try {
          Pi.init({ version: "2.0", sandbox: CLIENT_FEATURES.piSandbox });
        } catch {
          /* ignore */
        }
        return;
      }
      if (attempt < 40) {
        setTimeout(() => tryInit(attempt + 1), 150);
      }
    };
    tryInit(0);
    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
