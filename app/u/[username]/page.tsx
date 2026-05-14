/* eslint-disable @next/next/no-img-element */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  BadgeCheck,
  Eye,
  Film,
  Heart,
  MessageCircle,
  Play,
  Share2,
  UserRound,
} from "lucide-react";
import {
  getPublicUserProfile,
  type PublicUserProfile,
  type PublicUserVideo,
} from "@/lib/social/user-profile";
import { getOptionalSocialUserId } from "@/lib/social/session";
import ProfileStatsAndActions from "./ProfileStatsAndActions";
import VideoGridClient from "./VideoGridClient";

type Props = {
  params: Promise<{ username: string }>;
};

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;

  try {
    const data = await getPublicUserProfile(username, { limit: 1 });
    if (!data) return { title: "Profil negasit - Swypik" };

    return {
      title: `${data.profile.displayName} (${data.profile.handle}) - Swypik`,
      description:
        data.profile.bio ||
        `Vezi profilul, clipurile si activitatea lui ${data.profile.displayName} pe Swypik.`,
      openGraph: {
        title: `${data.profile.displayName} - Swypik`,
        description: data.profile.bio || "Profil public Swypik",
        type: "profile",
        images: data.profile.avatarUrl ? [data.profile.avatarUrl] : [],
      },
    };
  } catch {
    return { title: "Profil Swypik" };
  }
}

export default async function UserProfilePage({ params }: Props) {
  const { username } = await params;

  let data: PublicUserProfile | null = null;
  try {
    const viewerUserId = await getCurrentViewerUserId();
    data = await getPublicUserProfile(username, { viewerUserId, limit: 24 });
  } catch (error) {
    console.error("[User Profile Page] Load Error:", error);
    return <ProfileLoadError />;
  }

  if (!data) notFound();

  const { profile, stats, videos } = data;

  return (
    <main className="min-h-screen bg-[#0D0D0D] text-white mobile-page-bottom">
      <header className="sticky top-0 z-30 bg-[#0D0D0D]/80 backdrop-blur-md border-b border-white/10 px-4 py-3 flex items-center justify-between">
        <Link href="/explore" className="text-white/70 hover:text-white" aria-label="Inapoi"><ArrowLeft size={22} /></Link>
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
            {profile.isVerified && <BadgeCheck className="text-[#EC4899]" size={18} aria-label="Profil verificat" />}
          </div>
          <p className="text-sm text-white/60 mb-4">{profile.handle}</p>

          {profile.bio && (
            <p className="max-w-sm text-sm leading-5 text-white/70 mb-4">{profile.bio}</p>
          )}

          <ProfileStatsAndActions
            userId={profile.id}
            isOwnProfile={profile.isOwnProfile}
            initialFollowing={profile.isFollowing}
            stats={stats}
          />
        </div>
      </div>

      <section className="mx-auto max-w-md pb-10">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-black text-white">Clipuri</h2>
            <p className="mt-1 text-sm text-white/45">
              {stats.videos === 1 ? "1 clip public" : `${stats.videos} clipuri publice`}
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
        ) : <EmptyVideosState profileName={profile.displayName} />}
      </section>
    </main>
  );
}

async function getCurrentViewerUserId() {
  return getOptionalSocialUserId();
}

function Avatar({ profile }: { profile: PublicUserProfile["profile"] }) {
  if (profile.avatarUrl) {
    return (
      <div className="h-28 w-28 overflow-hidden rounded-full border border-white/15 bg-white/10 shadow-2xl shadow-black/40 sm:h-32 sm:w-32">
        <img
          src={profile.avatarUrl}
          alt={profile.displayName}
          className="h-full w-full object-cover"
          loading="eager"
        />
      </div>
    );
  }

  return (
    <div className="grid h-28 w-28 place-items-center rounded-full border border-white/15 bg-[#0D0D0D] shadow-2xl shadow-black/40 sm:h-32 sm:w-32">
      <span className="text-4xl font-black text-white sm:text-5xl">{initials(profile.displayName)}</span>
    </div>
  );
}

function VideoGrid({ videos }: { videos: PublicUserVideo[] }) {
  return (
    <div className="grid grid-cols-3 gap-0.5">
      {videos.map((video) => (
        <VideoCard key={video.id} video={video} />
      ))}
    </div>
  );
}

function VideoCard({ video }: { video: PublicUserVideo }) {
  const title = video.title || video.description || "Clip Swypik";
  return (
    <Link href={`/explore?v=${encodeURIComponent(video.id)}`} className="group block">
      <div className="relative aspect-[9/16] overflow-hidden bg-[#1A1A1A]">
        {video.thumbnailUrl ? (
          <img
            src={video.thumbnailUrl}
            alt={title}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="grid h-full w-full place-items-center text-white/25">
            <Film size={28} strokeWidth={1.5} />
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/70 to-transparent pointer-events-none" />
        <div className="absolute bottom-1 left-1.5 flex items-center gap-1 text-[10px] font-bold text-white/95">
          <Play size={11} fill="currentColor" />
          {formatCount(video.viewCount)}
        </div>
      </div>
    </Link>
  );
}

function EmptyVideosState({ profileName }: { profileName: string }) {
  return (
    <div className="flex min-h-72 flex-col items-center justify-center rounded-3xl border border-dashed border-white/15 bg-white/[0.03] px-6 py-14 text-center">
      <div className="grid h-16 w-16 place-items-center rounded-2xl bg-[#0D0D0D]/10 text-[#0D0D0D]">
        <Film size={32} strokeWidth={1.5} />
      </div>
      <h2 className="mt-5 text-lg font-black text-white">Nu exista clipuri publice</h2>
      <p className="mt-2 max-w-sm text-sm leading-6 text-white/50">
        {profileName} nu a publicat inca clipuri vizibile pentru comunitate.
      </p>
      <Link href="/explore" className="mt-6 rounded-2xl bg-white px-5 py-3 text-sm font-black text-[#0D0D0D]">
        Exploreaza alte clipuri
      </Link>
    </div>
  );
}

function ProfileLoadError() {
  return (
    <main className="grid min-h-screen place-items-center bg-[#0D0D0D] px-4 text-white">
      <div className="max-w-md text-center">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-red-500/10 text-red-300">
          <UserRound size={32} strokeWidth={1.5} />
        </div>
        <h1 className="mt-5 text-2xl font-black">Profil indisponibil</h1>
        <p className="mt-2 text-sm leading-6 text-white/55">
          Nu am putut incarca profilul acum. Incearca din nou sau revino la feed.
        </p>
        <Link href="/explore" className="mt-6 inline-flex rounded-2xl bg-white px-5 py-3 text-sm font-black text-[#0D0D0D]">
          Inapoi la feed
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

function formatDuration(value: number | null) {
  if (!value) return "";
  const totalSeconds = Math.round(value / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
