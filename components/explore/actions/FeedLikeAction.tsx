"use client";

import { useCallback } from "react";
import { Heart } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/ui/cn";
import { compactCount } from "../format";
import RailButton from "./RailButton";
import { postToggle, useToggleAction, type ToggleResult } from "./useToggleAction";

export type FeedLikeActionProps = {
  videoId: string;
  liked: boolean;
  count: number;
  onChange: (state: { liked: boolean; count: number }) => void;
};

/**
 * Like în feed (POST /api/videos/[id]/like, toggle). Local până la
 * `components/social/LikeButton` (agentul de profile) — aceeași interfață
 * (videoId/liked/count/onChange), deci se poate înlocui 1:1.
 */
export default function FeedLikeAction({ videoId, liked, count, onChange }: FeedLikeActionProps) {
  const t = useTranslations("explore");
  const locale = useLocale();
  const { toast } = useToast();
  const request = useCallback(async (): Promise<ToggleResult> => {
    const data = await postToggle(`/api/videos/${encodeURIComponent(videoId)}/like`);
    return { on: Boolean(data.liked), count: Number(data.like_count ?? count) || 0 };
  }, [videoId, count]);
  const { toggle, busy } = useToggleAction({
    on: liked,
    count,
    request,
    onChange: (s) => onChange({ liked: s.on, count: s.count }),
    onError: () => toast({ title: t("actionFailed"), tone: "danger" }),
    loginNext: `/explore?v=${videoId}`,
  });
  return (
    <RailButton
      label={liked ? t("unlike") : t("apreciaza")}
      pressed={liked}
      busy={busy}
      onClick={toggle}
      count={compactCount(count, locale)}
      icon={<Heart aria-hidden className={cn(liked ? "fill-danger text-danger" : "fill-transparent")} />}
    />
  );
}
