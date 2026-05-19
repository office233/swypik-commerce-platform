"use client";

import { useEffect, useState } from "react";

export default function Countdown({ target }: { target: string }) {
  const t = new Date(target).getTime();
  const fmt = new Date(target).toLocaleString("ro-RO");
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  if (now === null) {
    return (
      <span suppressHydrationWarning>
        Se publică · {fmt}
      </span>
    );
  }

  const diff = Math.max(0, t - now);
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  return (
    <span>
      Se publică în <strong>{h}h {m}m</strong> · {fmt}
    </span>
  );
}
