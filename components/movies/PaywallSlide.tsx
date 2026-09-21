"use client";
import { Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import UnlockButton from "./UnlockButton";

type Props = {
  slug: string;
  episodeId: string;
  episodeNumber: number;
  totalEpisodes: number;
  priceUnits: number;
  seasonPriceUnits: number;
  balanceUnits: number | null;
  poster: string | null;
  onUnlocked: () => void;
};

export default function PaywallSlide(p: Props) {
  const t = useTranslations("movies");
  return (
    <div className="relative flex h-full w-full flex-col items-center justify-end bg-neutral-950 px-6 pb-24 text-white">
      {p.poster && <div className="absolute inset-0 bg-cover bg-center opacity-30 blur-md" style={{ backgroundImage: `url(${p.poster})` }} />}
      <div className="relative w-full max-w-sm space-y-3 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/20">
          <Lock size={24} />
        </div>
        <p className="text-xs font-bold uppercase tracking-widest text-white/60">{t("episodeOf", { n: p.episodeNumber, total: p.totalEpisodes })}</p>
        <h2 className="text-2xl font-black">{t("locked")}</h2>
        <UnlockButton
          slug={p.slug}
          target={{ episodeId: p.episodeId }}
          priceUnits={p.priceUnits}
          balanceUnits={p.balanceUnits}
          label={t("unlockEpisode")}
          onUnlocked={p.onUnlocked}
        />
        {p.seasonPriceUnits > 0 && (
          <UnlockButton
            slug={p.slug}
            target={{ season: true }}
            priceUnits={p.seasonPriceUnits}
            balanceUnits={p.balanceUnits}
            label={t("unlockSeason")}
            onUnlocked={p.onUnlocked}
          />
        )}
      </div>
    </div>
  );
}
