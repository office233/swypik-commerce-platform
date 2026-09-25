"use client";

import { useMemo, useState, type ReactNode } from "react";
import { CalendarClock, MessageCircle, Music, Repeat2, Scissors, X } from "lucide-react";
import { useTranslations } from "next-intl";
import AudioPicker from "@/components/reels/AudioPicker";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { IconButton } from "@/components/ui/IconButton";
import { Field, Input, Textarea } from "@/components/ui/Input";
import { ListItem } from "@/components/ui/ListItem";
import { Switch } from "@/components/ui/Switch";
import { extractHashtags, type PublishIntent } from "@/lib/upload/details";
import type { DetailsDraft } from "@/lib/upload/draft-store";
import { VIDEO_LIMITS } from "@/lib/video/limits";
import { CaptionsPanel } from "./CaptionsPanel";
import { MissionPicker } from "./MissionPicker";
import { ProductPicker } from "./ProductPicker";
import { ScheduleSheet } from "./ScheduleSheet";
import { StickyActions } from "./StickyActions";

type Update = <K extends keyof DetailsDraft>(key: K, value: DetailsDraft[K]) => void;

/** Pasul 3: titlu, descriere + hashtag-uri, sunet, produs, misiune, subtitrări, permisiuni, publicare. */
export function DetailsStep(props: {
  details: DetailsDraft;
  update: Update;
  videoId: string | null;
  coverUrl: string | null;
  durationSec: number | null;
  processingReady: boolean;
  canPublish: boolean;
  canSaveDraft: boolean;
  submitting: PublishIntent | null;
  onSubmit: (intent: PublishIntent, scheduledAt?: string) => void;
  status: ReactNode;
}) {
  const t = useTranslations("videoUpload.details");
  const { details, update } = props;
  const [audioOpen, setAudioOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const hashtags = useMemo(() => extractHashtags(details.description), [details.description]);

  const toggle = (key: "allowComments" | "allowDuet" | "allowStitch", icon: typeof MessageCircle, label: string) => (
    <ListItem
      icon={icon}
      title={label}
      trailing={<Switch checked={details[key]} onCheckedChange={(v) => update(key, v)} aria-label={label} />}
    />
  );

  return (
    <div className="mx-auto w-full max-w-md space-y-4 px-gutter py-4">
      <div className="flex items-start gap-3">
        {props.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={props.coverUrl} alt="" className="h-28 w-16 shrink-0 rounded-control bg-black object-cover" />
        ) : null}
        <div className="min-w-0 flex-1">{props.status}</div>
      </div>

      <Field label={t("title")} hint={t("counter", { n: details.title.length, max: VIDEO_LIMITS.titleMaxChars })}>
        {(f) => (
          <Input
            {...f}
            value={details.title}
            maxLength={VIDEO_LIMITS.titleMaxChars}
            placeholder={t("titlePlaceholder")}
            onChange={(e) => update("title", e.target.value)}
          />
        )}
      </Field>

      <Field label={t("description")} hint={t("descriptionHint")}>
        {(f) => (
          <Textarea
            {...f}
            rows={4}
            value={details.description}
            maxLength={VIDEO_LIMITS.descriptionMaxChars}
            placeholder={t("descriptionPlaceholder")}
            onChange={(e) => update("description", e.target.value)}
          />
        )}
      </Field>
      {hashtags.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5" aria-label={t("hashtags")}>
          {hashtags.map((h) => (
            <li key={h}>
              <Badge tone="brand">#{h}</Badge>
            </li>
          ))}
        </ul>
      ) : null}

      <Card padding="sm" className="space-y-1">
        {details.audioTrackId ? (
          <ListItem
            icon={Music}
            title={details.audioTrackLabel ?? t("soundSelected")}
            subtitle={t("soundHint")}
            trailing={
              <span className="flex">
                <IconButton label={t("changeSound")} onClick={() => setAudioOpen(true)}>
                  <Music aria-hidden />
                </IconButton>
                <IconButton
                  label={t("removeSound")}
                  onClick={() => {
                    update("audioTrackId", null);
                    update("audioTrackLabel", null);
                  }}
                >
                  <X aria-hidden />
                </IconButton>
              </span>
            }
          />
        ) : (
          <ListItem icon={Music} title={t("addSound")} onClick={() => setAudioOpen(true)} />
        )}
        <ProductPicker
          productId={details.productId}
          productTitle={details.productTitle}
          overlaySec={details.productOverlaySec}
          maxSec={props.durationSec}
          onSelect={(p) => {
            update("productId", p?.id ?? null);
            update("productTitle", p?.title ?? null);
          }}
          onOverlay={(sec) => update("productOverlaySec", sec)}
        />
        <MissionPicker slug={details.missionSlug} onChange={(slug) => update("missionSlug", slug)} />
      </Card>

      <Card padding="sm">
        <CaptionsPanel
          videoId={props.videoId}
          ready={props.processingReady}
          enabled={details.captionsEnabled}
          onEnabled={(v) => update("captionsEnabled", v)}
        />
      </Card>

      <Card padding="sm" className="space-y-1">
        {toggle("allowComments", MessageCircle, t("allowComments"))}
        {toggle("allowDuet", Repeat2, t("allowDuet"))}
        {toggle("allowStitch", Scissors, t("allowStitch"))}
      </Card>

      <StickyActions>
        <Button variant="secondary" size="lg" loading={props.submitting === "draft"} disabled={!props.canSaveDraft || !!props.submitting} onClick={() => props.onSubmit("draft")}>
          {t("saveDraft")}
        </Button>
        <IconButton variant="secondary" size="lg" label={t("schedule")} disabled={!props.canPublish || !!props.submitting} onClick={() => setScheduleOpen(true)}>
          <CalendarClock aria-hidden />
        </IconButton>
        <Button size="lg" block loading={props.submitting === "public"} disabled={!props.canPublish || !!props.submitting} onClick={() => props.onSubmit("public")}>
          {t("publish")}
        </Button>
      </StickyActions>

      <ScheduleSheet
        open={scheduleOpen}
        onOpenChange={setScheduleOpen}
        busy={props.submitting === "scheduled"}
        onConfirm={(iso) => props.onSubmit("scheduled", iso)}
      />
      <AudioPicker
        open={audioOpen}
        onClose={() => setAudioOpen(false)}
        selectedId={details.audioTrackId}
        onSelect={(track) => {
          update("audioTrackId", track?.id ?? null);
          update("audioTrackLabel", track ? `${track.title} · ${track.artist}` : null);
          setAudioOpen(false);
        }}
      />
    </div>
  );
}
