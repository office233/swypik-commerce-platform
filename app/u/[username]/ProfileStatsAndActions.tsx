"use client";

import { useState } from "react";
import Link from "next/link";

type ProfileStatsAndActionsProps = {
  userId: string;
  isOwnProfile: boolean;
  initialFollowing: boolean;
  stats: {
    videos: number;
    followers: number;
    following: number;
    views: number;
    likes: number;
    comments: number;
  };
};

export default function ProfileStatsAndActions({
  userId,
  isOwnProfile,
  initialFollowing,
  stats,
}: ProfileStatsAndActionsProps) {
  const [following, setFollowing] = useState(initialFollowing);
  const [followerCount, setFollowerCount] = useState(stats.followers);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function handleFollow() {
    if (pending) return;
    setPending(true);
    setError("");

    try {
      const response = await fetch(`/api/users/${encodeURIComponent(userId)}/follow`, {
        method: "POST",
      });
      const data = await response.json().catch(() => ({}));

      if (response.status === 401) {
        setError("Autentifica-te pentru a urmari profilul.");
        return;
      }

      if (!response.ok) {
        setError(data?.error || "Nu am putut actualiza follow-ul.");
        return;
      }

      const nextFollowing = Boolean(data.following);
      setFollowing(nextFollowing);
      setFollowerCount((current) => {
        if (Number.isFinite(Number(data.follower_count))) {
          return Math.max(0, Math.trunc(Number(data.follower_count)));
        }
        return Math.max(0, current + (nextFollowing ? 1 : -1));
      });
    } catch {
      setError("Eroare de retea. Incearca din nou.");
    } finally {
      setPending(false);
    }
  }

  const statItems = [
    { label: "Clipuri", value: stats.videos },
    { label: "Urmaritori", value: followerCount },
    { label: "Urmariri", value: stats.following },
    { label: "Aprecieri", value: stats.likes },
  ];

  return (
    <div className="mt-6 flex w-full flex-col items-center gap-5">
      <div className="grid w-full max-w-xl grid-cols-2 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] sm:grid-cols-4">
        {statItems.map((item) => (
          <div key={item.label} className="border-white/10 px-4 py-3 text-center sm:border-r sm:last:border-r-0">
            <div className="text-lg font-black leading-none text-white sm:text-xl">
              {formatCount(item.value)}
            </div>
            <div className="mt-1 text-[11px] font-bold uppercase text-white/45">
              {item.label}
            </div>
          </div>
        ))}
      </div>

      {isOwnProfile ? (
        <Link
          href="/creator"
          className="rounded-2xl border border-white/10 bg-white px-5 py-3 text-sm font-black text-[#0D0D0D] transition hover:bg-white/90"
        >
          Profilul tau
        </Link>
      ) : (
        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            aria-pressed={following}
            disabled={pending}
            onClick={handleFollow}
            className={`min-w-36 rounded-2xl px-5 py-3 text-sm font-black transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70 ${
              following
                ? "border border-white/15 bg-white/10 text-white hover:bg-white/15"
                : "bg-[#10A37F] text-white shadow-[0_10px_30px_rgba(16,163,127,0.28)] hover:bg-[#0E906F]"
            }`}
          >
            {pending ? "Se salveaza..." : following ? "Urmaresti" : "Urmareste"}
          </button>
          {error && <p className="max-w-xs text-center text-xs font-bold text-red-300">{error}</p>}
        </div>
      )}
    </div>
  );
}

function formatCount(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(value);
}
