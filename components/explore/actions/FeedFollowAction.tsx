"use client";

import { useCallback } from "react";
import { Check, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/ui/cn";
import { postToggle, useToggleAction, type ToggleResult } from "./useToggleAction";

export type FeedFollowActionProps = {
  creatorId: string;
  creatorName: string;
  following: boolean;
  onChange: (following: boolean) => void;
};

/**
 * „+” rotund sub avatarul creatorului (POST /api/users/[id]/follow, toggle).
 * Local până la `components/social/FollowButton` (variant="badge").
 */
export default function FeedFollowAction({ creatorId, creatorName, following, onChange }: FeedFollowActionProps) {
  const t = useTranslations("explore");
  const { toast } = useToast();
  const request = useCallback(async (): Promise<ToggleResult> => {
    const data = await postToggle(`/api/users/${encodeURIComponent(creatorId)}/follow`);
    return { on: Boolean(data.following), count: 0 };
  }, [creatorId]);
  const { toggle, busy } = useToggleAction({
    on: following,
    count: 0,
    request,
    onChange: (s) => onChange(s.on),
    onError: () => toast({ title: t("actionFailed"), tone: "danger" }),
    loginNext: "/explore",
  });
  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-pressed={following}
      aria-label={following ? t("unfollowCreator", { name: creatorName }) : t("followCreator", { name: creatorName })}
      className={cn(
        "absolute -bottom-3 left-1/2 flex h-6 w-6 -translate-x-1/2 items-center justify-center rounded-full ring-2 ring-black",
        "before:absolute before:h-11 before:w-11 before:content-['']",
        following ? "bg-surface text-fg" : "bg-brand text-brand-fg",
      )}
    >
      {following ? <Check aria-hidden className="h-3.5 w-3.5" /> : <Plus aria-hidden className="h-3.5 w-3.5" />}
    </button>
  );
}
