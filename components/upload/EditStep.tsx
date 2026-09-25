"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, ImageIcon, RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { captureFrame, formatDuration, seekTo, type ProbedFile } from "@/lib/upload/media";
import { clampTrim, type TrimRange } from "@/lib/upload/trim";
import { TrimControl } from "./TrimControl";
import { StickyActions } from "./StickyActions";

/** Pasul 2: tăiere + alegerea copertei, pe previzualizarea locală (fără să aștepte uploadul). */
export function EditStep(props: {
  previewUrl: string;
  probe: ProbedFile | null;
  trim: TrimRange | null;
  onTrim: (t: TrimRange) => void;
  coverUrl: string | null;
  onCover: (jpeg: Blob, atMs: number) => void;
  onRetake: (() => void) | null;
  onNext: () => void;
  status: ReactNode;
}) {
  const t = useTranslations("videoUpload.edit");
  const videoRef = useRef<HTMLVideoElement>(null);
  const [coverAt, setCoverAt] = useState(0);
  const [capturing, setCapturing] = useState(false);
  const { probe, trim } = props;

  // Previzualizarea redă doar intervalul ales.
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !trim) return;
    const onTime = () => {
      if (v.currentTime * 1000 >= trim.endMs || v.currentTime * 1000 < trim.startMs - 250) v.currentTime = trim.startMs / 1000;
    };
    v.addEventListener("timeupdate", onTime);
    return () => v.removeEventListener("timeupdate", onTime);
  }, [trim]);

  const pickCover = async () => {
    const v = videoRef.current;
    if (!v) return;
    setCapturing(true);
    try {
      v.pause();
      await seekTo(v, coverAt / 1000);
      props.onCover(await captureFrame(v), coverAt);
    } catch {
      /* cadru indisponibil (codec) — rămâne coperta automată a workerului */
    } finally {
      setCapturing(false);
      void v.play().catch(() => undefined);
    }
  };

  return (
    <div className="mx-auto w-full max-w-md space-y-4 px-gutter py-4">
      <div className="relative mx-auto aspect-[9/16] max-h-[55dvh] overflow-hidden rounded-card bg-black">
        <video
          ref={videoRef}
          src={props.previewUrl}
          className="h-full w-full object-contain"
          autoPlay
          loop
          muted
          playsInline
          aria-label={t("preview")}
        />
      </div>
      {props.status}

      {probe && trim ? (
        <Card className="space-y-5">
          <TrimControl durationMs={probe.durationMs} value={trim} onChange={(v, moved) => props.onTrim(clampTrim(v, probe.durationMs, moved))} />
          <div className="space-y-2">
            <label htmlFor="cover-at" className="flex justify-between text-sm font-semibold text-fg">
              <span>{t("cover")}</span>
              <span className="text-xs font-normal tabular-nums text-muted">{formatDuration(coverAt)}</span>
            </label>
            <input
              id="cover-at"
              type="range"
              min={trim.startMs}
              max={trim.endMs}
              step={100}
              value={Math.min(Math.max(coverAt, trim.startMs), trim.endMs)}
              onChange={(e) => {
                const ms = Number(e.target.value);
                setCoverAt(ms);
                if (videoRef.current) {
                  videoRef.current.pause();
                  videoRef.current.currentTime = ms / 1000;
                }
              }}
              className="h-11 w-full accent-brand"
            />
            <div className="flex items-center gap-3">
              {props.coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={props.coverUrl} alt={t("coverChosen")} className="h-16 w-9 rounded-control object-cover" />
              ) : (
                <span className="flex h-16 w-9 items-center justify-center rounded-control bg-surface-2 text-subtle">
                  <ImageIcon className="h-4 w-4" aria-hidden />
                </span>
              )}
              <Button variant="secondary" onClick={() => void pickCover()} loading={capturing}>
                <Check className="h-4 w-4" aria-hidden /> {t("useFrame")}
              </Button>
            </div>
            <p className="text-xs text-muted">{props.coverUrl ? t("coverCustomHint") : t("coverAutoHint")}</p>
          </div>
        </Card>
      ) : (
        <Card variant="muted" className="text-sm text-muted">
          {t("noPreviewHint")}
        </Card>
      )}

      <StickyActions>
        {props.onRetake ? (
          <Button variant="secondary" size="lg" onClick={props.onRetake}>
            <RotateCcw className="h-5 w-5" aria-hidden /> {t("retake")}
          </Button>
        ) : null}
        <Button size="lg" block onClick={props.onNext}>
          {t("next")}
        </Button>
      </StickyActions>
    </div>
  );
}
