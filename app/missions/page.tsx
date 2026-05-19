import Link from "next/link";
import { dbQuery } from "@/lib/db";
import { Trophy, Coins, Clock, Users } from "lucide-react";

export const dynamic = "force-dynamic";
export const metadata = { title: "Missions — Swypik Creators" };

type MissionRow = {
  id: string;
  slug: string;
  title: string;
  brief: string | null;
  format_hint: string | null;
  product_id: string | null;
  product_title: string | null;
  product_image: string | null;
  prize_amount_minor: number;
  prize_currency: string;
  bounty_per_sale_minor: number;
  ends_at: string | null;
  submissions_count: number;
};

function fmtPrize(amount: number, currency: string): string {
  if (currency === "SWYP") return `${amount.toLocaleString("ro-RO")} SWYP`;
  return `${(amount / 100).toFixed(2)} ${currency}`;
}

function fmtRemaining(endsAt: string | null): string {
  if (!endsAt) return "Fără termen";
  const ms = new Date(endsAt).getTime() - Date.now();
  if (ms <= 0) return "Expirat";
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  if (d > 0) return `${d}z ${h}h`;
  return `${h}h`;
}

export default async function MissionsPage() {
  const { rows } = await dbQuery<MissionRow>(
    `SELECT
       m.id, m.slug, m.title, m.brief, m.format_hint,
       m.product_id,
       p.title     AS product_title,
       p.image_url AS product_image,
       m.prize_amount_minor, m.prize_currency, m.bounty_per_sale_minor,
       m.ends_at,
       (SELECT COUNT(*)::int FROM creator_mission_submissions s WHERE s.mission_id = m.id) AS submissions_count
     FROM creator_missions m
     LEFT JOIN marketplace_products p ON p.id = m.product_id
     WHERE m.status = 'active'
       AND (m.ends_at IS NULL OR m.ends_at > now())
     ORDER BY (m.ends_at IS NULL), m.ends_at ASC, m.starts_at DESC
     LIMIT 50`,
  );

  return (
    <main className="min-h-screen bg-[#0D0D0D] text-white pb-24">
      <header className="sticky top-0 z-10 bg-[#0D0D0D]/90 backdrop-blur border-b border-white/10 px-4 py-4">
        <h1 className="text-2xl font-black flex items-center gap-2">
          <Trophy className="w-6 h-6 text-yellow-400" /> Missions
        </h1>
        <p className="text-sm text-white/60 mt-1">
          Brief-uri plătite pentru creatori. Câștigi SWYP + bounty per vânzare.
        </p>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-6">
        {rows.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-8 text-center text-white/60">
            Nu sunt mission-uri active acum. Revino curând!
          </div>
        ) : (
          <ul className="space-y-3">
            {rows.map((m) => (
              <li key={m.id}>
                <Link
                  href={`/missions/${m.slug}`}
                  className="block rounded-2xl border border-white/10 bg-white/[0.04] p-4 hover:border-yellow-400/50 transition"
                >
                  <div className="flex gap-3">
                    {m.product_image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={m.product_image}
                        alt=""
                        className="w-20 h-20 rounded-xl object-cover border border-white/10 flex-shrink-0"
                      />
                    ) : (
                      <div className="w-20 h-20 rounded-xl bg-white/5 flex items-center justify-center text-2xl flex-shrink-0">
                        🎯
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <h2 className="font-bold line-clamp-2">{m.title}</h2>
                      {m.brief ? (
                        <p className="text-xs text-white/60 mt-1 line-clamp-2">{m.brief}</p>
                      ) : null}
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                        <span className="inline-flex items-center gap-1 rounded-full bg-yellow-400/15 px-2 py-1 text-yellow-300">
                          <Coins className="w-3 h-3" /> {fmtPrize(m.prize_amount_minor, m.prize_currency)}
                        </span>
                        {m.bounty_per_sale_minor > 0 ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-green-400/15 px-2 py-1 text-green-300">
                            +{(m.bounty_per_sale_minor / 100).toFixed(2)}/vânzare
                          </span>
                        ) : null}
                        <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-1 text-white/60">
                          <Clock className="w-3 h-3" /> {fmtRemaining(m.ends_at)}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-1 text-white/60">
                          <Users className="w-3 h-3" /> {m.submissions_count}
                        </span>
                      </div>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
