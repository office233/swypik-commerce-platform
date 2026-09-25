"use client";
import { useEffect, useState } from "react";
import { Play } from "lucide-react";
import { useTranslations } from "next-intl";
import { useHlsVideo } from "@/lib/video/useHlsVideo";
import { Button } from "@/components/ui/Button";

type Props = {
  src: string;
  poster: string | null;
  muted: boolean;
  resumeMs: number;
  onEnded: () => void;
  onTime: (ms: number) => void;
  onError: () => void;
};

/**
 * Video-ul episodului. Dacă browserul refuză autoplay-ul cu sunet (mobil),
 * arătăm un buton „Atinge pentru redare" în loc să eșueze în tăcere.
 */
export default function EpisodeVideo({ src, poster, muted, resumeMs, onEnded, onTime, onError }: Props) {
  const t = useTranslations("movies");
  const ref = useHlsVideo(src);
  const [needsTap, setNeedsTap] = useState(false);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    setNeedsTap(false);
    const seek = () => {
      if (resumeMs > 0 && v.currentTime < resumeMs / 1000) v.currentTime = resumeMs / 1000;
    };
    v.addEventListener("loadedmetadata", seek, { once: true });
    v.play().catch(() => setNeedsTap(true));
    return () => v.removeEventListener("loadedmetadata", seek);
  }, [ref, src, resumeMs]);

  const tapToPlay = () => {
    const v = ref.current;
    if (!v) return;
    v.play().then(() => setNeedsTap(false)).catch(() => setNeedsTap(true));
  };

  return (
    <>
      <video
        ref={ref}
        className="h-full w-full object-cover"
        playsInline
        muted={muted}
        poster={poster ?? undefined}
        onEnded={onEnded}
        onError={onError}
        onTimeUpdate={(e) => onTime(e.currentTarget.currentTime * 1000)}
      />
      {needsTap && (
        <div className="absolute inset-0 z-10 flex items-center justify-center">
          <Button size="lg" onClick={tapToPlay}>
            <Play className="h-4 w-4" fill="currentColor" aria-hidden /> {t("tapToPlay")}
          </Button>
        </div>
      )}
    </>
  );
}
