"use client";

import Link from "next/link";
import { EyeOff, MessageCircle } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Avatar } from "@/components/ui/Avatar";
import type { FeedVideo } from "@/lib/feed/types";
import FeedFollowAction from "./actions/FeedFollowAction";
import FeedLikeAction from "./actions/FeedLikeAction";
import FeedSaveAction from "./actions/FeedSaveAction";
import FeedShareAction from "./actions/FeedShareAction";
import RailButton from "./actions/RailButton";
import { compactCount } from "./format";

export type ActionRailProps = {
  video: FeedVideo;
  onPatch: (patch: (v: FeedVideo) => FeedVideo) => void;
  onFollowChange: (creatorId: string, following: boolean) => void;
  onOpenComments: () => void;
  onNotInterested: () => void;
};

/** Coloana de acțiuni din dreapta: creator (+follow), like, comentarii, salvare, share, „nu mă interesează”. */
export default function ActionRail({ video, onPatch, onFollowChange, onOpenComments, onNotInterested }: ActionRailProps) {
  const t = useTranslations("explore");
  const locale = useLocale();
  const handle = video.creator.username || video.creator.id;
  const displayName = video.creator.name || video.creator.username || t("genericCreator");

  return (
    <div
      className="absolute right-2 z-20 flex flex-col items-center gap-3"
      style={{ bottom: "calc(var(--bottom-inset, 0px) + 1rem)", marginRight: "env(safe-area-inset-right, 0px)" }}
      role="group"
      aria-label={t("actiuniVideo")}
    >
      {video.creator.id ? (
        <div className="relative mb-3">
          <Link href={`/u/${encodeURIComponent(handle)}`} aria-label={t("openCreatorProfile", { name: displayName })} className="block rounded-full ring-2 ring-white">
            <Avatar src={video.creator.avatar} name={displayName} size="md" />
          </Link>
          <FeedFollowAction
            creatorId={video.creator.id}
            creatorName={displayName}
            following={video.viewer.following}
            onChange={(following) => onFollowChange(video.creator.id, following)}
          />
        </div>
      ) : null}
      <FeedLikeAction
        videoId={video.id}
        liked={video.viewer.liked}
        count={video.likes}
        onChange={({ liked, count }) => onPatch((v) => ({ ...v, likes: count, viewer: { ...v.viewer, liked } }))}
      />
      <RailButton
        label={t("discutii")}
        onClick={onOpenComments}
        count={compactCount(video.comments, locale)}
        icon={<MessageCircle aria-hidden />}
      />
      <FeedSaveAction
        videoId={video.id}
        saved={video.viewer.saved}
        count={video.saves}
        onChange={({ saved, count }) => onPatch((v) => ({ ...v, saves: count, viewer: { ...v.viewer, saved } }))}
      />
      <FeedShareAction videoId={video.id} count={video.shares} onShared={(count) => onPatch((v) => ({ ...v, shares: count }))} />
      <RailButton label={t("notInterested")} onClick={onNotInterested} icon={<EyeOff aria-hidden />} />
    </div>
  );
}
