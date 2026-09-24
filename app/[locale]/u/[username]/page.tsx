/* eslint-disable @next/next/no-img-element */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isHTTPAccessFallbackError } from "next/dist/client/components/http-access-fallback/http-access-fallback";
import { getTranslations } from "next-intl/server";
import {
  ArrowLeft,
  BadgeCheck,
  Eye,
  Film,
  MessageCircle,
  Share2,
  UserRound,
} from "lucide-react";
import {
  getPublicUserProfile,
  type PublicUserProfile,
} from "@/lib/social/user-profile";
import { getOptionalSocialUserId } from "@/lib/social/session";
import { logger } from "@/lib/logger";
import ProfileStatsAndActions from "./ProfileStatsAndActions";
import VideoGridClient from "./VideoGridClient";

type Props = {
  params: Promise<{ locale: string; username: string }>;
};

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, username } = await params;
  const t = await getTranslations({ locale, namespace: "userProfile" });

  try {
    const data = await getPublicUserProfile(username, { limit: 1 });
    if (!data) return { title: t("metaNotFoundTitle"), robots: { index: false, follow: false } };

    return {
      title: `${data.profile.displayName} (${data.profile.handle}) - Swypik`,
      description:
        data.profile.bio ||
        t("metaDescriptionFallback", { name: data.profile.displayName }),
      openGraph: {
        title: `${data.profile.displayName} - Swypik`,
        description: data.profile.bio || t("metaOgDescriptionFallback"),
        type: "profile",
        images: data.profile.avatarUrl ? [data.profile.avatarUrl] : [],
      },
    };
  } catch {
    return { title: t("metaFallbackTitle") };
  }
}

export default async function UserProfilePage({ params }: Props) {
  const { locale, username } = await params;
  const t = await getTranslations({ locale, namespace: "userProfile" });

  let data: PublicUserProfile | null = null;
  try {
    const viewerUserId = await getCurrentViewerUserId();
    data = await getPublicUserProfile(username, { viewerUserId, limit: 24 });
  } catch (error) {
    // notFound() aruncă intern un NEXT_NOT_FOUND — nu îl înghiți în catch,
    // altfel pagina cade pe ProfileLoadError cu status HTTP 200 (bug SEO).
    if (isHTTPAccessFallbackError(error)) throw error;
    logger.error({ err: error }, "[User Profile Page] Load Error");
    return <ProfileLoadError t={t} />;
  }

  if (!data) notFound();

  const { profile, stats, videos, badges, promotedProducts } = data;

  return (
    <main className="min-h-screen bg-[#0D0D0D] text-white mobile-page-bottom">
      <header className="sticky top-0 z-30 bg-[#0D0D0D]/80 backdrop-blur-md border-b border-white/10 px-4 py-3 flex items-center justify-between">
        <Link href="/explore" className="text-white/70 hover:text-white" aria-label={t("back")}><ArrowLeft size={22} /></Link>
        <h1 className="text-lg font-black truncate max-w-[60%]">{profile.handle.replace(/^@/, '')}</h1>
        <div className="w-6" />
      </header>

      <div className="max-w-md mx-auto px-4 pt-6">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-24 h-24 rounded-full bg-gradient-to-tr from-[#7C3AED] to-[#EC4899] p-1 mb-4">
            <div className="w-full h-full rounded-full bg-[#1A1A1A] flex items-center justify-center overflow-hidden border-2 border-[#0D0D0D]">
              {profile.avatarUrl ? (
                <img src={profile.avatarUrl} alt={profile.displayName} className="w-full h-full object-cover" loading="eager" />
              ) : (
                <span className="text-3xl font-black text-white">{initials(profile.displayName)}</span>
              )}
            </div>
          </div>

          <div className="flex items-center justify-center gap-1.5">
            <h2 className="text-xl font-black">{profile.displayName}</h2>
            {profile.isVerified && <BadgeCheck className="text-[#EC4899]" size={18} aria-label={t("verifiedProfile")} />}
          </div>
          <p className="text-sm text-white/60 mb-4">{profile.handle}</p>

          <CreatorBadgesRow badges={badges} t={t} />

          {profile.bio && (
            <p className="max-w-sm text-sm leading-5 text-white/70 mb-4">{profile.bio}</p>
          )}

          {profile.links.length > 0 && (
            <div className="mb-4 flex flex-wrap items-center justify-center gap-2">
              {profile.links.map((link) => (
                <a
                  key={link.url}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-bold text-white/80 hover:bg-white/10"
                >
                  <Share2 size={12} />
                  {link.label}
                </a>
              ))}
            </div>
          )}

          {profile.categories.length > 0 && (
            <div className="mb-4 flex flex-wrap items-center justify-center gap-1.5">
              {profile.categories.map((cat) => (
                <span
                  key={cat}
                  className="rounded-full bg-white/[0.07] px-2.5 py-0.5 text-[11px] font-bold text-white/55"
                >
                  #{cat}
                </span>
              ))}
            </div>
          )}

          <ProfileStatsAndActions
            userId={profile.id}
            isOwnProfile={profile.isOwnProfile}
            initialFollowing={profile.isFollowing}
            stats={stats}
          />
        </div>
      </div>

      {promotedProducts.length > 0 && (
        <section className="mx-auto max-w-md px-4 pb-2">
          <h2 className="mb-3 text-lg font-black text-white">{t("promotedProducts")}</h2>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {promotedProducts.map((product) => (
              <a
                key={product.id}
                href={product.productUrl || `/product/${encodeURIComponent(product.id)}`}
                target={product.productUrl ? "_blank" : undefined}
                rel={product.productUrl ? "noopener noreferrer nofollow" : undefined}
                className="w-32 shrink-0 rounded-2xl border border-white/10 bg-white/[0.04] p-2 hover:bg-white/[0.08]"
              >
                <div className="mb-2 aspect-square overflow-hidden rounded-xl bg-[#1A1A1A]">
                  {product.imageUrl ? (
                    <img src={product.imageUrl} alt={product.title} className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <div className="grid h-full w-full place-items-center text-white/20">
                      <Film size={22} strokeWidth={1.5} />
                    </div>
                  )}
                </div>
                <p className="line-clamp-2 text-xs font-bold text-white/85">{product.title}</p>
                {product.priceCents !== null && (
                  <p className="mt-1 text-xs font-black text-[#EC4899]">
                    {(product.priceCents / 100).toFixed(2)} {product.currency}
                  </p>
                )}
              </a>
            ))}
          </div>
        </section>
      )}

      <section className="mx-auto max-w-md pb-10">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-black text-white">{t("clips")}</h2>
            <p className="mt-1 text-sm text-white/45">
              {stats.videos === 1 ? t("oneClipPublic") : t("nClipsPublic", { count: stats.videos })}
            </p>
          </div>
          <div className="hidden items-center gap-4 text-sm font-bold text-white/45 sm:flex">
            <span className="inline-flex items-center gap-1.5">
              <Eye size={16} />
              {formatCount(stats.views)}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <MessageCircle size={16} />
              {formatCount(stats.comments)}
            </span>
          </div>
        </div>

        {videos.length > 0 ? (
          <VideoGridClient
            username={(profile.username || username) as string}
            creatorId={profile.id}
            initialVideos={videos.map((v) => ({
              id: v.id,
              title: v.title,
              description: v.description,
              thumbnailUrl: v.thumbnailUrl,
              durationMs: v.durationMs,
              viewCount: v.viewCount,
              likeCount: v.likeCount,
              commentCount: v.commentCount,
              saveCount: v.saveCount,
              shareCount: v.shareCount,
            }))}
            initialHasMore={videos.length >= 24}
          />
        ) : <EmptyVideosState profileName={profile.displayName} t={t} />}
      </section>
    </main>
  );
}

async function getCurrentViewerUserId() {
  return getOptionalSocialUserId();
}

function CreatorBadgesRow({ badges, t }: { badges: PublicUserProfile["badges"]; t: Awaited<ReturnType<typeof getTranslations>> }) {
  const items: { key: string; label: string; className: string }[] = [];
  if (badges.verified) {
    items.push({ key: "verified", label: t("badgeVerified"), className: "border-[#EC4899]/40 bg-[#EC4899]/10 text-[#EC4899]" });
  }
  if (badges.topSeller) {
    items.push({ key: "top_seller", label: t("badgeTopSeller"), className: "border-amber-400/40 bg-amber-400/10 text-amber-300" });
  }
  if (badges.level !== "none") {
    const levelStyles: Record<string, { label: string; className: string }> = {
      bronze: { label: t("badgeLevelBronze"), className: "border-orange-700/50 bg-orange-700/15 text-orange-300" },
      silver: { label: t("badgeLevelSilver"), className: "border-slate-300/40 bg-slate-300/10 text-slate-200" },
      gold: { label: t("badgeLevelGold"), className: "border-yellow-400/50 bg-yellow-400/10 text-yellow-300" },
    };
    const style = levelStyles[badges.level];
    if (style) items.push({ key: `level_${badges.level}`, label: t("badgeCreatorLevel", { level: style.label }), className: style.className });
  }
  if (items.length === 0) return null;
  return (
    <div className="mb-3 flex flex-wrap items-center justify-center gap-1.5">
      {items.map((item) => (
        <span
          key={item.key}
          className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-black ${item.className}`}
        >
          <BadgeCheck size={12} />
          {item.label}
        </span>
      ))}
    </div>
  );
}

function EmptyVideosState({ profileName, t }: { profileName: string; t: Awaited<ReturnType<typeof getTranslations>> }) {
  return (
    <div className="flex min-h-72 flex-col items-center justify-center rounded-3xl border border-dashed border-white/15 bg-white/[0.03] px-6 py-14 text-center">
      <div className="grid h-16 w-16 place-items-center rounded-2xl bg-[#0D0D0D]/10 text-[#0D0D0D]">
        <Film size={32} strokeWidth={1.5} />
      </div>
      <h2 className="mt-5 text-lg font-black text-white">{t("noPublicClips")}</h2>
      <p className="mt-2 max-w-sm text-sm leading-6 text-white/50">
        {t("noPublicClipsBody", { name: profileName })}
      </p>
      <Link href="/explore" className="mt-6 rounded-2xl bg-white px-5 py-3 text-sm font-black text-[#0D0D0D]">
        {t("exploreOtherClips")}
      </Link>
    </div>
  );
}

function ProfileLoadError({ t }: { t: Awaited<ReturnType<typeof getTranslations>> }) {
  return (
    <main className="grid min-h-screen place-items-center bg-[#0D0D0D] px-4 text-white">
      <div className="max-w-md text-center">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-red-500/10 text-red-300">
          <UserRound size={32} strokeWidth={1.5} />
        </div>
        <h1 className="mt-5 text-2xl font-black">{t("profileUnavailable")}</h1>
        <p className="mt-2 text-sm leading-6 text-white/55">
          {t("profileUnavailableBody")}
        </p>
        <Link href="/explore" className="mt-6 inline-flex rounded-2xl bg-white px-5 py-3 text-sm font-black text-[#0D0D0D]">
          {t("backToFeed")}
        </Link>
      </div>
    </main>
  );
}

function initials(name: string) {
  const value = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase();
  return value || "U";
}

function formatCount(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(value);
}

