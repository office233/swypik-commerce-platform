"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Trash2, X, Loader2, Send } from "lucide-react";

type Action = "delete" | "cancel-schedule" | "publish-now";

export default function DraftActions(props: {
  videoId: string;
  action: Action;
  label: string;
  icon: "trash" | "x" | "send";
  confirm: string;
}) {
  const { videoId, action, label, icon, confirm } = props;
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function run() {
    if (typeof window !== "undefined" && !window.confirm(confirm)) return;
    setBusy(true);
    try {
      if (action === "delete") {
        await fetch(`/api/creator/videos/${videoId}`, { method: "DELETE" });
      } else if (action === "cancel-schedule") {
        await fetch(`/api/creator/videos/${videoId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scheduled_publish_at: null }),
        });
      } else if (action === "publish-now") {
        await fetch(`/api/creator/videos/${videoId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            is_draft: false,
            scheduled_publish_at: null,
            visibility: "public",
          }),
        });
      }
      router.refresh();
    } catch {
      // ignore
    } finally {
      setBusy(false);
    }
  }

  const Icon = icon === "trash" ? Trash2 : icon === "send" ? Send : X;
  const publish = action === "publish-now";

  return (
    <button
      type="button"
      onClick={run}
      disabled={busy}
      className={
        publish
          ? "h-9 px-3 rounded-lg bg-[#7C3AED] text-white text-xs font-bold flex items-center gap-1 hover:bg-[#6D28D9] disabled:opacity-50"
          : "h-9 px-3 rounded-lg border border-[#E5E5E5] text-xs font-bold text-[#0D0D0D] flex items-center gap-1 hover:bg-[#F7F7F8] disabled:opacity-50"
      }
    >
      {busy ? <Loader2 size={12} className="animate-spin" /> : <Icon size={12} />}
      {label}
    </button>
  );
}
