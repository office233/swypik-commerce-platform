/**
 * Admin Strikes Dashboard — top risk users + per-user strike history (revocable).
 * Mirrors GET /api/admin/strikes.
 */
import { dbQuery } from "@/lib/db";
import Link from "next/link";
import { Shield, AlertCircle } from "lucide-react";
import RevokeStrikeButton from "./RevokeStrikeButton";

export const dynamic = "force-dynamic";

interface TopUser {
  user_id: string;
  username: string | null;
  display_name: string | null;
  status: string | null;
  suspended_until: string | null;
  score: number;
  strike_count: number;
  blocked_count: number;
  adult_count: number;
  sensitive_count: number;
  last_strike_at: string | null;
}

interface StrikeRow {
  id: string;
  severity: number | null;
  label: string | null;
  context: string | null;
  reason: string | null;
  ref_type: string | null;
  ref_id: string | null;
  reasons: unknown;
  created_at: string;
  expires_at: string | null;
  status: string;
  revoked_at: string | null;
  notes: string | null;
}

async function getTopUsers(): Promise<TopUser[]> {
  try {
    const { rows } = await dbQuery<TopUser>(
      `SELECT r.user_id,
              u.username, u.display_name, u.status, u.suspended_until,
              r.score::float AS score, r.strike_count, r.blocked_count,
              r.adult_count, r.sensitive_count, r.last_strike_at
         FROM user_risk_scores r
         JOIN users u ON u.id = r.user_id
        WHERE r.score > 0
        ORDER BY r.score DESC, r.last_strike_at DESC NULLS LAST
        LIMIT 100`,
    );
    return rows;
  } catch {
    return [];
  }
}

async function getUserStrikes(
  userId: string,
): Promise<{ summary: TopUser | null; strikes: StrikeRow[] }> {
  try {
    const { rows: strikes } = await dbQuery<StrikeRow>(
      `SELECT s.id, s.severity, s.label, s.context, s.reason,
              s.ref_type, s.ref_id, s.reasons, s.created_at,
              s.expires_at, s.status, s.revoked_at, s.notes
         FROM user_strikes s
        WHERE s.user_id = $1
        ORDER BY s.created_at DESC
        LIMIT 100`,
      [userId],
    );
    const { rows: summaryRows } = await dbQuery<TopUser>(
      `SELECT u.id AS user_id, u.username, u.display_name, u.status,
              u.suspended_until,
              COALESCE(r.score, 0)::float AS score,
              COALESCE(r.strike_count, 0) AS strike_count,
              COALESCE(r.blocked_count, 0) AS blocked_count,
              COALESCE(r.adult_count, 0) AS adult_count,
              COALESCE(r.sensitive_count, 0) AS sensitive_count,
              r.last_strike_at
         FROM users u
         LEFT JOIN user_risk_scores r ON r.user_id = u.id
        WHERE u.id = $1
        LIMIT 1`,
      [userId],
    );
    return { summary: summaryRows[0] ?? null, strikes };
  } catch {
    return { summary: null, strikes: [] };
  }
}

function fmtDate(d: string | null) {
  if (!d) return "—";
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

function sevBadge(sev: number | null) {
  const n = sev ?? 0;
  const color =
    n >= 3 ? "bg-red-500/20 text-red-300 border-red-500/40"
      : n >= 2 ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
      : "bg-white/10 text-white/70 border-white/20";
  return (
    <span className={`inline-block text-[10px] font-black uppercase px-1.5 py-0.5 rounded border ${color}`}>
      sev {n}
    </span>
  );
}

export default async function AdminStrikesPage({
  searchParams,
}: {
  searchParams: Promise<{ userId?: string }>;
}) {
  const params = await searchParams;
  const userId = params.userId?.trim() || null;

  if (userId) {
    const { summary, strikes } = await getUserStrikes(userId);
    return (
      <div className="p-4 md:p-6 max-w-5xl mx-auto text-white">
        <div className="mb-6 flex items-center gap-2">
          <Shield className="w-6 h-6" />
          <h1 className="text-2xl font-black">Strikes — user</h1>
          <Link
            href="/admin/strikes"
            className="ml-auto text-xs font-bold text-white/60 hover:text-white underline"
          >
            ← înapoi la lista
          </Link>
        </div>

        {!summary ? (
          <div className="rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-white/60">
            Utilizator inexistent.
          </div>
        ) : (
          <>
            <div className="mb-4 rounded-lg border border-white/10 bg-white/5 p-4">
              <div className="text-sm font-bold">
                {summary.display_name || summary.username || summary.user_id}
              </div>
              <div className="text-xs text-white/50 font-mono">{summary.user_id}</div>
              <div className="mt-3 grid grid-cols-2 md:grid-cols-6 gap-3 text-xs">
                <Stat label="Score" value={summary.score} highlight={summary.score >= 50} />
                <Stat label="Strikes" value={summary.strike_count} />
                <Stat label="Blocked" value={summary.blocked_count} />
                <Stat label="Adult" value={summary.adult_count} />
                <Stat label="Sensitive" value={summary.sensitive_count} />
                <Stat label="Status" value={summary.status ?? "—"} />
              </div>
              {summary.suspended_until && (
                <div className="mt-2 text-xs text-amber-300">
                  Suspendat până: {fmtDate(summary.suspended_until)}
                </div>
              )}
            </div>

            <div className="rounded-lg border border-white/10 bg-white/5 overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-white/5 text-white/60 uppercase tracking-wide">
                  <tr>
                    <th className="text-left p-2">Când</th>
                    <th className="text-left p-2">Sev</th>
                    <th className="text-left p-2">Label</th>
                    <th className="text-left p-2">Context</th>
                    <th className="text-left p-2">Ref</th>
                    <th className="text-left p-2">Expiră</th>
                    <th className="text-left p-2">Status</th>
                    <th className="text-right p-2">Acțiuni</th>
                  </tr>
                </thead>
                <tbody>
                  {strikes.length === 0 && (
                    <tr>
                      <td colSpan={8} className="p-4 text-center text-white/50">
                        Niciun strike înregistrat.
                      </td>
                    </tr>
                  )}
                  {strikes.map((s) => (
                    <tr key={s.id} className="border-t border-white/5">
                      <td className="p-2 whitespace-nowrap">{fmtDate(s.created_at)}</td>
                      <td className="p-2">{sevBadge(s.severity)}</td>
                      <td className="p-2 font-bold">{s.label ?? "—"}</td>
                      <td className="p-2 text-white/70">{s.context ?? s.reason ?? "—"}</td>
                      <td className="p-2 text-white/50 font-mono text-[10px]">
                        {s.ref_type ? `${s.ref_type}:${s.ref_id?.slice(0, 8) ?? ""}` : "—"}
                      </td>
                      <td className="p-2 whitespace-nowrap">{fmtDate(s.expires_at)}</td>
                      <td className="p-2">
                        {s.status === "active" ? (
                          <span className="text-emerald-300 font-bold">active</span>
                        ) : (
                          <span className="text-white/40">{s.status}</span>
                        )}
                      </td>
                      <td className="p-2 text-right">
                        {s.status === "active" && <RevokeStrikeButton strikeId={s.id} />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    );
  }

  const users = await getTopUsers();
  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto text-white">
      <div className="mb-6 flex items-center gap-2">
        <Shield className="w-6 h-6" />
        <h1 className="text-2xl font-black">Strikes — top risc</h1>
        <span className="ml-auto text-xs text-white/40">
          {users.length} utilizator{users.length === 1 ? "" : "i"}
        </span>
      </div>

      {users.length === 0 ? (
        <div className="rounded-lg border border-white/10 bg-white/5 p-6 text-center text-sm text-white/60 flex items-center justify-center gap-2">
          <AlertCircle className="w-4 h-4" /> Niciun utilizator cu score &gt; 0.
        </div>
      ) : (
        <div className="rounded-lg border border-white/10 bg-white/5 overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-white/5 text-white/60 uppercase tracking-wide">
              <tr>
                <th className="text-left p-2">User</th>
                <th className="text-right p-2">Score</th>
                <th className="text-right p-2">Strikes</th>
                <th className="text-right p-2">Blocked</th>
                <th className="text-right p-2">Adult</th>
                <th className="text-right p-2">Sensitive</th>
                <th className="text-left p-2">Last strike</th>
                <th className="text-left p-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.user_id} className="border-t border-white/5 hover:bg-white/5">
                  <td className="p-2">
                    <Link
                      href={`/admin/strikes?userId=${u.user_id}`}
                      className="font-bold hover:underline"
                    >
                      {u.display_name || u.username || u.user_id.slice(0, 8)}
                    </Link>
                    <div className="text-[10px] text-white/40 font-mono">{u.user_id}</div>
                  </td>
                  <td className={`p-2 text-right font-black ${u.score >= 50 ? "text-red-300" : u.score >= 20 ? "text-amber-300" : ""}`}>
                    {u.score}
                  </td>
                  <td className="p-2 text-right">{u.strike_count}</td>
                  <td className="p-2 text-right">{u.blocked_count}</td>
                  <td className="p-2 text-right">{u.adult_count}</td>
                  <td className="p-2 text-right">{u.sensitive_count}</td>
                  <td className="p-2 whitespace-nowrap">{fmtDate(u.last_strike_at)}</td>
                  <td className="p-2">
                    {u.status === "suspended" ? (
                      <span className="text-red-300 font-bold">suspended</span>
                    ) : (
                      <span className="text-white/50">{u.status ?? "—"}</span>
                    )}
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

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string | number;
  highlight?: boolean;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase text-white/40">{label}</div>
      <div className={`text-sm font-black ${highlight ? "text-red-300" : ""}`}>{value}</div>
    </div>
  );
}
