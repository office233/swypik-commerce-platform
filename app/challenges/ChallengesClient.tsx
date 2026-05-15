"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Coins, Trophy, Clock, Check, Sparkles, Info } from "lucide-react";

type Challenge = {
  id: string;
  title: string;
  description: string | null;
  challenge_type: string;
  topic: string | null;
  reward_points: number;
  max_entries: number | null;
  starts_at: string;
  ends_at: string;
  status: string;
  featured: boolean;
  banner_url: string | null;
};

type Entry = { challenge_id: string; status: string; score: string };

type Leader = {
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  lifetime_earned: string;
};

const TYPE_LABELS: Record<string, string> = {
  video: "Video",
  review: "Recenzie",
  engagement: "Engagement",
  commerce: "Cumparare",
  community: "Comunitate",
};

function timeLeft(ends_at: string): string {
  const diff = new Date(ends_at).getTime() - Date.now();
  if (diff <= 0) return "Expirat";
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (h >= 24) return `${Math.floor(h / 24)} zile`;
  if (h >= 1) return `${h}h ${m}m`;
  return `${m} min`;
}

function rankIcon(i: number): string {
  if (i === 0) return "🥇";
  if (i === 1) return "🥈";
  if (i === 2) return "🥉";
  return `#${i + 1}`;
}

export default function ChallengesClient({
  challenges,
  entries,
  leaderboard,
  isLoggedIn,
}: {
  challenges: Challenge[];
  entries: Entry[];
  leaderboard: Leader[];
  isLoggedIn: boolean;
}) {
  const [entered, setEntered] = useState<Record<string, Entry>>(() => {
    const m: Record<string, Entry> = {};
    for (const e of entries) m[e.challenge_id] = e;
    return m;
  });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sortedChallenges = useMemo(
    () =>
      [...challenges].sort((a, b) => {
        if (a.featured !== b.featured) return a.featured ? -1 : 1;
        return new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime();
      }),
    [challenges],
  );

  async function handleEnter(id: string) {
    if (!isLoggedIn) {
      window.location.href = `/auth?next=/challenges`;
      return;
    }
    setBusyId(id);
    setError(null);
    setEntered((prev) => ({
      ...prev,
      [id]: { challenge_id: id, status: "submitted", score: "0" },
    }));
    try {
      const res = await fetch(`/api/challenges/${id}/enter`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ video_id: null }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setEntered((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
        setError(j.error || "Inscrierea a esuat.");
      }
    } catch {
      setEntered((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setError("Eroare de retea.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white pb-24">
      <div className="max-w-5xl mx-auto px-4 pt-10">
        <header className="mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gradient-to-r from-purple-600/20 to-fuchsia-500/20 border border-purple-500/30 mb-4">
            <Sparkles className="w-4 h-4 text-purple-300" />
            <span className="text-xs font-medium text-purple-200">Provocări active</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
            Provocări <span className="bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-fuchsia-400">Swypik</span>
          </h1>
          <p className="text-neutral-400 mt-3 max-w-2xl">
            Participă la provocări zilnice, câștigă <span className="text-yellow-400 font-medium">Swyp Coins</span> și urcă în clasament.
          </p>
        </header>

        {error && (
          <div className="mb-6 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-200 text-sm">
            {error}
          </div>
        )}

        <section className="mb-14">
          {sortedChallenges.length === 0 ? (
            <div className="text-center py-16 text-neutral-500 border border-neutral-800 rounded-2xl">
              Nu există provocări active acum. Revino mai târziu.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {sortedChallenges.map((c) => {
                const myEntry = entered[c.id];
                const isFeatured = c.featured;
                const ended = new Date(c.ends_at).getTime() <= Date.now();
                const finished =
                  myEntry?.status === "approved" || myEntry?.status === "winner";
                return (
                  <article
                    key={c.id}
                    className={
                      "relative rounded-2xl p-[1px] transition-transform hover:-translate-y-0.5 " +
                      (isFeatured
                        ? "bg-gradient-to-br from-purple-500 via-fuchsia-500 to-purple-600"
                        : "bg-neutral-800")
                    }
                  >
                    <div className="rounded-2xl bg-neutral-950 p-5 h-full flex flex-col">
                      {c.banner_url && (
                        <div className="relative w-full h-36 mb-4 rounded-xl overflow-hidden">
                          <Image
                            src={c.banner_url}
                            alt={c.title}
                            fill
                            sizes="(max-width: 768px) 100vw, 50vw"
                            className="object-cover"
                          />
                        </div>
                      )}
                      <div className="flex items-center gap-2 mb-3 flex-wrap">
                        <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-300">
                          {TYPE_LABELS[c.challenge_type] || c.challenge_type}
                        </span>
                        {c.topic && (
                          <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-400">
                            #{c.topic}
                          </span>
                        )}
                        {isFeatured && (
                          <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-200 border border-purple-500/40">
                            Featured
                          </span>
                        )}
                      </div>

                      <h3 className="text-lg font-semibold leading-snug mb-1">
                        {c.title}
                      </h3>
                      {c.description && (
                        <p className="text-sm text-neutral-400 line-clamp-3 mb-4">
                          {c.description}
                        </p>
                      )}

                      <div className="mt-auto flex items-center justify-between gap-3 mb-4">
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-yellow-500/10 border border-yellow-500/30">
                          <Coins className="w-3.5 h-3.5 text-yellow-400" />
                          <span className="text-xs font-semibold text-yellow-300">
                            +{c.reward_points} coins
                          </span>
                        </div>
                        <div className="inline-flex items-center gap-1 text-xs text-neutral-400">
                          <Clock className="w-3.5 h-3.5" />
                          {ended ? "Expirat" : `Se termină în ${timeLeft(c.ends_at)}`}
                        </div>
                      </div>

                      {myEntry && Number(myEntry.score) > 0 && (
                        <div className="mb-3 text-xs text-neutral-400">
                          Progres: <span className="text-white font-medium">{Number(myEntry.score)}</span>
                        </div>
                      )}

                      {finished ? (
                        <button
                          disabled
                          className="w-full py-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-200 text-sm font-medium inline-flex items-center justify-center gap-1.5"
                        >
                          <Check className="w-4 h-4" /> Finalizat
                        </button>
                      ) : myEntry ? (
                        <button
                          disabled
                          className="w-full py-2.5 rounded-xl bg-purple-500/15 border border-purple-500/40 text-purple-200 text-sm font-medium inline-flex items-center justify-center gap-1.5"
                        >
                          <Check className="w-4 h-4" /> Înscris
                        </button>
                      ) : (
                        <button
                          onClick={() => handleEnter(c.id)}
                          disabled={busyId === c.id || ended}
                          className="w-full py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-fuchsia-600 hover:from-purple-500 hover:to-fuchsia-500 text-white text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {busyId === c.id ? "Se înscrie..." : "Participă"}
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section className="mb-14">
          <div className="flex items-center gap-2 mb-4">
            <Trophy className="w-5 h-5 text-yellow-400" />
            <h2 className="text-xl font-semibold">Top creatori — Swyp Coins</h2>
          </div>
          <div className="rounded-2xl border border-neutral-800 bg-neutral-950 overflow-hidden">
            {leaderboard.length === 0 ? (
              <div className="px-4 py-10 text-center text-neutral-500 text-sm">
                Niciun câștigător încă. Fii primul.
              </div>
            ) : (
              <ul>
                {leaderboard.map((u, i) => (
                  <li
                    key={u.user_id}
                    className={
                      "flex items-center gap-3 px-4 py-3 " +
                      (i < leaderboard.length - 1 ? "border-b border-neutral-900 " : "") +
                      (i === 0 ? "bg-gradient-to-r from-yellow-500/5 to-transparent" : "")
                    }
                  >
                    <span className="w-8 text-center text-sm font-semibold text-neutral-300">
                      {rankIcon(i)}
                    </span>
                    <div className="relative w-9 h-9 rounded-full overflow-hidden bg-neutral-800 shrink-0">
                      {u.avatar_url ? (
                        <Image
                          src={u.avatar_url}
                          alt={u.display_name || u.username || "user"}
                          fill
                          sizes="36px"
                          className="object-cover"
                        />
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">
                        {u.display_name || u.username || "Anonim"}
                      </div>
                      {u.username && (
                        <Link
                          href={`/u/${u.username}`}
                          className="text-xs text-neutral-500 hover:text-neutral-300"
                        >
                          @{u.username}
                        </Link>
                      )}
                    </div>
                    <div className="inline-flex items-center gap-1 text-sm font-semibold text-yellow-300">
                      <Coins className="w-4 h-4" />
                      {Number(u.lifetime_earned).toLocaleString("ro-RO")}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section>
          <div className="flex items-center gap-2 mb-4">
            <Info className="w-5 h-5 text-neutral-400" />
            <h2 className="text-xl font-semibold">Reguli și întrebări frecvente</h2>
          </div>
          <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5 text-sm text-neutral-300 space-y-3">
            <p>
              <strong className="text-white">Cum particip?</strong> Apasă butonul Participă pe o provocare activă. Trebuie să ai cont Swypik.
            </p>
            <p>
              <strong className="text-white">Cum primesc coin-urile?</strong> Recompensa se acordă automat în portofel când îndeplinești criteriile provocării.
            </p>
            <p>
              <strong className="text-white">Fair-play.</strong> Conturile cu engagement fals, spam sau conținut interzis sunt descalificate fără preaviz.
            </p>
            <p>
              <strong className="text-white">Clasamentul</strong> reflectă totalul de Swyp Coins câștigate (lifetime). Se actualizează în timp real.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
