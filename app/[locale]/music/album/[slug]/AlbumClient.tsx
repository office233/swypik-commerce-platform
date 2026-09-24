"use client";

/**
 * Pagina unui album: copertă, titlu, artist, preț + deblocare (dacă e
 * blocat), Play all și lista de piese. Butonul de deblocare e local (nu
 * există încă un `AlbumUnlockButton` partajat) — urmează același tipar ca
 * `components/movies/UnlockButton.tsx`, dar pentru `/api/music/albums/<slug>/unlock`.
 */
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Lock, Play } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/lib/i18n/navigation";
import TrackRow from "@/components/music/TrackRow";
import { useMusicPlayer } from "@/components/music/MusicPlayerProvider";
import { unitsToSwyp } from "@/components/music/format";
import { moviesDisplayFont, MOVIES_DISPLAY_CLASS } from "@/components/movies/fonts";
import { haptic } from "@/lib/haptic";
import type { AlbumDto, TrackDto } from "@/lib/music/types";
import AddToPlaylistSheet from "../../_components/AddToPlaylistSheet";
import LockedOverlay from "../../_components/LockedOverlay";
import { setTrackLiked } from "../../_lib/track-actions";

type Payload = { album: AlbumDto; tracks: TrackDto[] };

export default function AlbumClient({ slug }: { slug: string }) {
    const t = useTranslations("music");
    const router = useRouter();
    const { play } = useMusicPlayer();
    const [data, setData] = useState<Payload | null>(null);
    const [notFoundState, setNotFoundState] = useState(false);
    const [error, setError] = useState(false);
    const [balanceUnits, setBalanceUnits] = useState<number | null>(null);
    const [authRequired, setAuthRequired] = useState(false);
    const [unlockBusy, setUnlockBusy] = useState(false);
    const [unlockNotice, setUnlockNotice] = useState<string | null>(null);
    const [playlistTarget, setPlaylistTarget] = useState<TrackDto | null>(null);

    const load = useCallback(() => {
        fetch(`/api/music/albums/${slug}`, { cache: "no-store" })
            .then((r) => {
                if (r.status === 404) { setNotFoundState(true); return null; }
                if (!r.ok) return Promise.reject(r.status);
                return r.json();
            })
            .then((d: Payload | null) => { if (d) setData(d); })
            .catch(() => setError(true));
    }, [slug]);
    useEffect(load, [load]);

    useEffect(() => {
        fetch("/api/swyp/wallet", { cache: "no-store" })
            .then((res) => (res.status === 401 ? null : res.json()))
            .then((d: { balanceUnits?: string } | null) => {
                if (d && typeof d.balanceUnits !== "undefined") { setBalanceUnits(Number(d.balanceUnits)); setAuthRequired(false); }
                else { setBalanceUnits(null); setAuthRequired(true); }
            })
            .catch(() => { setBalanceUnits(null); setAuthRequired(true); });
    }, []);

    const toggleLike = async (track: TrackDto) => {
        if (!data) return;
        const next = !track.liked;
        setData({ ...data, tracks: data.tracks.map((tr) => (tr.id === track.id ? { ...tr, liked: next } : tr)) });
        const ok = await setTrackLiked(track.slug, next);
        if (!ok) setData((prev) => (prev ? { ...prev, tracks: prev.tracks.map((tr) => (tr.id === track.id ? { ...tr, liked: track.liked } : tr)) } : prev));
    };

    const unlock = async () => {
        if (authRequired) { router.push(`/auth?next=/music/album/${slug}`); return; }
        haptic("tap");
        setUnlockBusy(true);
        setUnlockNotice(null);
        try {
            const res = await fetch(`/api/music/albums/${slug}/unlock`, { method: "POST" });
            const body = await res.json().catch(() => ({}));
            if (res.ok) {
                load();
                if (typeof body.balanceUnits !== "undefined") setBalanceUnits(Number(body.balanceUnits));
                return;
            }
            if (res.status === 401) { setAuthRequired(true); router.push(`/auth?next=/music/album/${slug}`); return; }
            setUnlockNotice(body.error === "insufficient_balance" ? t("insufficient") : t("error"));
        } catch {
            setUnlockNotice(t("error"));
        } finally {
            setUnlockBusy(false);
        }
    };

    if (error) return <div className="flex min-h-screen items-center justify-center bg-[#0B0B12] text-white/70">{t("loadError")}</div>;
    if (notFoundState) return <div className="flex min-h-screen items-center justify-center bg-[#0B0B12] text-white/70">{t("empty")}</div>;
    if (!data) return <div className="min-h-screen bg-[#0B0B12]" />;

    const { album, tracks } = data;
    const insufficient = !authRequired && balanceUnits !== null && album.priceUnits !== null && balanceUnits < album.priceUnits;

    return (
        <main className={`${moviesDisplayFont.variable} min-h-screen bg-[#0B0B12] pb-24 text-white`}>
            <header className="fixed inset-x-0 top-0 z-30 flex items-center gap-3 bg-gradient-to-b from-black/90 to-transparent px-4 pb-3" style={{ paddingTop: "max(10px, env(safe-area-inset-top))" }}>
                <Link href="/music" aria-label={t("back")} className="rounded-full bg-black/40 p-2 ring-1 ring-white/15"><ArrowLeft size={18} /></Link>
            </header>

            <section className="px-5 pt-20 text-center">
                <div className="mx-auto aspect-square w-full max-w-xs overflow-hidden rounded-2xl bg-white/10 shadow-2xl ring-1 ring-white/10">
                    {album.coverUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={album.coverUrl} alt={album.title} className="h-full w-full object-cover" />
                    ) : (
                        <div className="h-full w-full bg-gradient-to-b from-white/10 to-black" />
                    )}
                </div>
                <h1 className={`${MOVIES_DISPLAY_CLASS} mt-5 truncate text-4xl leading-[0.95] text-white`}>{album.title}</h1>
                <Link href={`/music/artist/${album.artist.slug}`} className="mt-1 block truncate text-sm text-white/70">{album.artist.stageName}</Link>

                <div className="mx-auto mt-5 flex max-w-xs flex-col gap-2">
                    <button
                        type="button"
                        onClick={() => { haptic("tap"); if (tracks.length > 0) play(tracks, 0); }}
                        disabled={tracks.length === 0}
                        className="flex items-center justify-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-black text-black active:scale-95 disabled:opacity-40"
                    >
                        <Play size={18} fill="currentColor" /> {t("playAll")}
                    </button>

                    {album.locked && album.priceUnits !== null && (
                        <button
                            type="button"
                            onClick={unlock}
                            disabled={unlockBusy || insufficient}
                            className="flex items-center justify-center gap-2 rounded-full bg-white/10 px-5 py-3 text-sm font-black text-white ring-1 ring-white/20 active:scale-95 disabled:opacity-50"
                        >
                            {unlockBusy ? <Loader2 size={16} className="animate-spin" /> : <Lock size={16} />}
                            {unlockBusy
                                ? t("unlocking")
                                : authRequired
                                    ? t("loginToUnlock")
                                    : `${t("unlockAlbum")} · ${t("albumPriceSwyp", { amount: unitsToSwyp(album.priceUnits) })}`}
                        </button>
                    )}
                    {!authRequired && balanceUnits !== null && album.locked && (
                        <p className="text-[11px] text-white/60">{t("yourBalance", { amount: unitsToSwyp(balanceUnits) })}</p>
                    )}
                    {unlockNotice && <p className="text-xs text-amber-300">{unlockNotice}</p>}
                </div>
            </section>

            <section className="mt-8">
                {tracks.map((tr, i) => (
                    <TrackRow key={tr.id} track={tr} queue={tracks} index={i} onLike={toggleLike} onAddToPlaylist={setPlaylistTarget} />
                ))}
            </section>

            <LockedOverlay albumSlug={album.slug} />
            <AddToPlaylistSheet track={playlistTarget} onClose={() => setPlaylistTarget(null)} />
        </main>
    );
}
