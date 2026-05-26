/**
 * Admin Daily Challenges — list + create + status/featured toggle.
 * Mirrors /api/admin/challenges (GET, POST, PATCH).
 */
import { dbQuery } from "@/lib/db";
import { Trophy } from "lucide-react";
import NewChallengeForm from "./NewChallengeForm";
import ChallengeActions from "./ChallengeActions";

export const dynamic = "force-dynamic";

interface Challenge {
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
  created_at: string;
}

interface Counts {
  active: number;
  draft: number;
  completed: number;
  cancelled: number;
}

async function getChallenges(): Promise<Challenge[]> {
  try {
    const { rows } = await dbQuery<Challenge>(
      `SELECT id, title, description, challenge_type, topic, reward_points,
              max_entries, starts_at, ends_at, status, featured, banner_url,
              created_at
         FROM daily_challenges
        ORDER BY created_at DESC
        LIMIT 200`,
    );
    return rows;
  } catch {
    return [];
  }
}

async function getCounts(): Promise<Counts> {
  try {
    const { rows } = await dbQuery<{ status: string; c: number }>(
      `SELECT status, COUNT(*)::int AS c FROM daily_challenges GROUP BY status`,
    );
    const c: Counts = { active: 0, draft: 0, completed: 0, cancelled: 0 };
    for (const r of rows) {
      if (r.status in c) (c as unknown as Record<string, number>)[r.status] = r.c;
    }
    return c;
  } catch {
    return { active: 0, draft: 0, completed: 0, cancelled: 0 };
  }
}

function fmtDate(d: string) {
  try {
    return new Date(d).toLocaleString("ro-RO", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return d;
  }
}

function statusBadge(status: string) {
  const color =
    status === "active"
      ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
      : status === "draft"
      ? "bg-white/10 text-white/60 border-white/20"
      : status === "completed"
      ? "bg-sky-500/20 text-sky-300 border-sky-500/40"
      : "bg-red-500/20 text-red-300 border-red-500/40";
  return (
    <span className={`inline-block text-[10px] font-black uppercase px-1.5 py-0.5 rounded border ${color}`}>
      {status}
    </span>
  );
}

export default async function AdminChallengesPage() {
  const [challenges, counts] = await Promise.all([getChallenges(), getCounts()]);

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto text-white">
      <div className="mb-6 flex items-center gap-2">
        <Trophy className="w-6 h-6" />
        <h1 className="text-2xl font-black">Daily Challenges</h1>
        <span className="ml-auto text-xs text-white/40">
          {challenges.length} total
        </span>
      </div>

      <div className="mb-6 grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Active" value={counts.active} tone="emerald" />
        <StatCard label="Draft" value={counts.draft} />
        <StatCard label="Completed" value={counts.completed} tone="sky" />
        <StatCard label="Cancelled" value={counts.cancelled} tone="red" />
      </div>

      <details className="mb-6 rounded-lg border border-white/10 bg-white/5">
        <summary className="cursor-pointer px-4 py-3 text-sm font-bold hover:bg-white/5">
          + Creează challenge nou
        </summary>
        <div className="p-4 border-t border-white/10">
          <NewChallengeForm />
        </div>
      </details>

      {challenges.length === 0 ? (
        <div className="rounded-lg border border-white/10 bg-white/5 p-6 text-center text-sm text-white/60">
          Niciun challenge creat încă.
        </div>
      ) : (
        <div className="rounded-lg border border-white/10 bg-white/5 overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-white/5 text-white/60 uppercase tracking-wide">
              <tr>
                <th className="text-left p-2">Titlu</th>
                <th className="text-left p-2">Tip</th>
                <th className="text-right p-2">Reward</th>
                <th className="text-left p-2">Start</th>
                <th className="text-left p-2">End</th>
                <th className="text-left p-2">Status</th>
                <th className="text-left p-2">Featured</th>
                <th className="text-right p-2">Acțiuni</th>
              </tr>
            </thead>
            <tbody>
              {challenges.map((c) => (
                <tr key={c.id} className="border-t border-white/5 hover:bg-white/5">
                  <td className="p-2">
                    <div className="font-bold">{c.title}</div>
                    {c.description && (
                      <div className="text-[10px] text-white/40 line-clamp-1 max-w-[260px]">
                        {c.description}
                      </div>
                    )}
                  </td>
                  <td className="p-2 text-white/70">{c.challenge_type}</td>
                  <td className="p-2 text-right font-mono">{c.reward_points}</td>
                  <td className="p-2 whitespace-nowrap">{fmtDate(c.starts_at)}</td>
                  <td className="p-2 whitespace-nowrap">{fmtDate(c.ends_at)}</td>
                  <td className="p-2">{statusBadge(c.status)}</td>
                  <td className="p-2">
                    {c.featured ? (
                      <span className="text-amber-300 font-bold">★</span>
                    ) : (
                      <span className="text-white/30">—</span>
                    )}
                  </td>
                  <td className="p-2 text-right">
                    <ChallengeActions
                      id={c.id}
                      status={c.status}
                      featured={c.featured}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "emerald" | "sky" | "red";
}) {
  const color =
    tone === "emerald" ? "text-emerald-300"
      : tone === "sky" ? "text-sky-300"
      : tone === "red" ? "text-red-300"
      : "text-white";
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-3">
      <div className="text-[10px] uppercase text-white/40">{label}</div>
      <div className={`text-2xl font-black ${color}`}>{value}</div>
    </div>
  );
}
