"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Trash2, X, Loader2 } from "lucide-react";

type Action = "delete" | "cancel-schedule";

export default function DraftActions(props: {
  videoId: string;
  action: Action;
  label: string;
  icon: "trash" | "x";
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
      }
      router.refresh();
    } catch {
      // ignore
    } finally {
      setBusy(false);
    }
  }

  const Icon = icon === "trash" ? Trash2 : X;

  return (
    <button
      type="button"
      onClick={run}
      disabled={busy}
      className="h-9 px-3 rounded-lg border border-[#E5E5E5] text-xs font-bold text-[#0D0D0D] flex items-center gap-1 hover:bg-[#F7F7F8] disabled:opacity-50"
    >
      {busy ? <Loader2 size={12} className="animate-spin" /> : <Icon size={12} />}
      {label}
    </button>
  );
}
