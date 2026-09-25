"use client";

import { useCallback, useState } from "react";
import { Share2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useToast } from "@/components/ui/Toast";
import { haptic } from "@/lib/haptic";
import { trackEvent } from "@/lib/feed/track";
import { compactCount } from "../format";
import RailButton from "./RailButton";

export type FeedShareActionProps = {
  videoId: string;
  count: number;
  onShared: (count: number) => void;
};

/** Share nativ (sau copiere link) + contor (POST /api/videos/[id]/share). */
export default function FeedShareAction({ videoId, count, onShared }: FeedShareActionProps) {
  const t = useTranslations("explore");
  const locale = useLocale();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  const share = useCallback(async () => {
    haptic("tap");
    setBusy(true);
    const url = `${window.location.origin}/explore?v=${encodeURIComponent(videoId)}`;
    let channel = "copy_link";
    try {
      if (typeof navigator.share === "function") {
        channel = "native_share";
        await navigator.share({ title: t("shareVideoTitle"), url }).catch(() => undefined);
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        toast({ title: t("linkCopiat"), tone: "success" });
      }
      const res = await fetch(`/api/videos/${encodeURIComponent(videoId)}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel, referrer_url: window.location.href }),
      });
      const data = (await res.json().catch(() => ({}))) as { share_count?: number };
      if (!res.ok) throw new Error("share_failed");
      onShared(Number(data.share_count ?? count + 1) || count + 1);
      trackEvent("share", { video_id: videoId, metadata: { channel } });
    } catch {
      toast({ title: t("shareNotRecorded"), tone: "danger" });
    } finally {
      setBusy(false);
    }
  }, [videoId, count, onShared, t, toast]);

  return (
    <RailButton label={t("distribuie")} busy={busy} onClick={share} count={compactCount(count, locale)} icon={<Share2 aria-hidden />} />
  );
}
