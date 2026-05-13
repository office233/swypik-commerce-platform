"use client";

import { useState } from "react";
import { MoreVertical, Sparkles, EyeOff, UserPlus, Flag, Loader2 } from "lucide-react";

type Props = {
  videoId: string;
  creatorId?: string;
  /** True if the viewer already follows the creator (toggles follow/unfollow). */
  isFollowing?: boolean;
  onActionDone?: (
    action: "more_like_this" | "not_interested" | "follow_creator" | "unfollow" | "report",
  ) => void;
  className?: string;
};

/**
 * MoreLikeThisMenu — kebab menu surfaced on each feed item.
 *
 * Actions:
 *   - more_like_this   → POST /api/feed/action  (boosts the video's topic +5)
 *   - not_interested   → POST /api/feed/action  (hides + downweights -3)
 *   - follow / unfollow→ POST /api/feed/action
 *   - report           → no-op placeholder, opens a separate report flow
 *
 * Server responds 204 No Content. Feedback is local-only (toast text).
 */
export default function MoreLikeThisMenu({
  videoId,
  creatorId,
  isFollowing = false,
  onActionDone,
  className = "",
}: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2400);
  };

  const send = async (
    action: "more_like_this" | "not_interested" | "follow_creator" | "unfollow",
    successMessage: string,
  ) => {
    if (busy) return;
    setBusy(action);
    try {
      const res = await fetch("/api/feed/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ video_id: videoId, action }),
      });
      if (res.ok) {
        showToast(successMessage);
        onActionDone?.(action);
        setOpen(false);
      }
    } finally {
      setBusy(null);
    }
  };

  const report = () => {
    showToast("Mulțumim, vom analiza.");
    onActionDone?.("report");
    setOpen(false);
  };

  return (
    <div className={`relative inline-flex flex-col items-center ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Mai multe"
        className="flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white transition hover:bg-black/60"
      >
        <MoreVertical className="h-5 w-5" />
      </button>

      {toast && (
        <div className="pointer-events-none absolute -top-12 right-0 z-50 whitespace-nowrap rounded-full bg-black/85 px-3 py-1.5 text-xs font-medium text-white shadow-lg">
          {toast}
        </div>
      )}

      {open && (
        <div
          className="absolute right-full top-0 z-50 mr-2 w-60 rounded-xl border border-white/10 bg-neutral-900/95 p-1 text-sm text-white shadow-2xl backdrop-blur"
          onMouseLeave={() => setOpen(false)}
        >
          <MenuItem
            icon={busy === "more_like_this" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4 text-neutral-700" />}
            label="Mai arată-mi ca asta"
            onClick={() => send("more_like_this", "Vom afișa mai multe ca acesta")}
            disabled={busy !== null}
          />
          <MenuItem
            icon={busy === "not_interested" ? <Loader2 className="h-4 w-4 animate-spin" /> : <EyeOff className="h-4 w-4 text-amber-400" />}
            label="Nu-mi arăta asta"
            onClick={() => send("not_interested", "Nu vei mai vedea conținut similar")}
            disabled={busy !== null}
          />
          {creatorId && (
            <MenuItem
              icon={busy === (isFollowing ? "unfollow" : "follow_creator") ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4 text-sky-400" />}
              label={isFollowing ? "Dezabonează-te" : "Urmărește creator"}
              onClick={() =>
                send(
                  isFollowing ? "unfollow" : "follow_creator",
                  isFollowing ? "Te-ai dezabonat" : "Urmărești acum",
                )
              }
              disabled={busy !== null}
            />
          )}
          <div className="my-1 border-t border-white/10" />
          <MenuItem
            icon={<Flag className="h-4 w-4 text-rose-400" />}
            label="Raportează"
            onClick={report}
            disabled={busy !== null}
          />
        </div>
      )}
    </div>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-white/10 disabled:opacity-50"
    >
      <span className="flex h-5 w-5 items-center justify-center">{icon}</span>
      <span className="flex-1">{label}</span>
    </button>
  );
}
