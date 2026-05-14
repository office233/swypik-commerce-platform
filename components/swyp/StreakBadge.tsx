"use client";

/**
 * SWYP streak mini-widget. Fetches /api/wallet and renders the current streak.
 * Hides itself if streak is 0. Pair with /wallet page.
 */

import { useEffect, useState } from "react";

type WalletInfo = {
  balance?: number;
  swyp_streak?: number;
  swyp_streak_last_claim_at?: string | null;
};

export default function StreakBadge() {
  const [info, setInfo] = useState<WalletInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/wallet", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled || !j) return;
        setInfo(j);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const streak = info?.swyp_streak ?? 0;
  if (streak <= 0) return null;

  return (
    <div className="inline-flex items-center gap-2 rounded-full bg-orange-50 px-3 py-1 text-sm font-medium text-orange-700 dark:bg-orange-950 dark:text-orange-300">
      <span aria-hidden>🔥</span>
      <span>Streak: {streak} {streak === 1 ? "zi" : "zile"}</span>
    </div>
  );
}
