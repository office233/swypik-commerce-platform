import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Clock, Coins, Trophy, Users, Video } from "lucide-react";
import { dbQuery } from "@/lib/db";

export const dynamic = "force-dynamic";

type MissionDetailRow = {
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

function formatPrize(amount: number, currency: string): string {
  if (currency === "SWYP") return `${amount.toLocaleString("ro-RO")} SWYP`;
  return `${(amount / 100).toFixed(2)} ${currency}`;
}

function formatRemaining(endsAt: string | null): string {
  if (!endsAt) return "Fără termen";
  const milliseconds = new Date(endsAt).getTime() - Date.now();
  if (milliseconds <= 0) return "Expirat";
  const days = Math.floor(milliseconds / 86_400_000);
  const hours = Math.floor((milliseconds % 86_400_000) / 3_600_000);
  if (days > 0) return `${days}z ${hours}h`;
  return `${hours}h`;
}

async function getMission(slug: string) {
  const { rows } = await dbQuery<MissionDetailRow>(
    `SELECT
       missions.id, missions.slug, missions.title, missions.brief, missions.format_hint,
       missions.product_id,
       products.title AS product_title,
       products.image_url AS product_image,
       missions.prize_amount_minor, missions.prize_currency, missions.bounty_per_sale_minor,
       missions.ends_at,
       (SELECT COUNT(*)::int FROM creator_mission_submissions submissions WHERE submissions.mission_id = missions.id) AS submissions_count
     FROM creator_missions missions
     LEFT JOIN marketplace_products products ON products.id = missions.product_id
     WHERE missions.slug = $1
       AND missions.status = 'active'
       AND (missions.ends_at IS NULL OR missions.ends_at > now())
     LIMIT 1`,
    [slug],
  );

  return rows[0] ?? null;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const mission = await getMission(slug).catch(() => null);
  return {
    title: mission ? `${mission.title} — Swypik Missions` : "Mission — Swypik",
  };
}

export default async function MissionDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const mission = await getMission(slug);

  if (!mission) notFound();

  return (
    <main className="min-h-screen bg-[#0D0D0D] text-white pb-24">
      <header className="sticky top-0 z-10 bg-[#0D0D0D]/90 backdrop-blur border-b border-white/10 px-4 py-4">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <Link
            href="/missions"
            className="grid h-10 w-10 place-items-center rounded-full text-white/70 hover:bg-white/10 hover:text-white transition"
            aria-label="Înapoi la missions"
          >
            <ArrowLeft size={20} />
          </Link>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-black">Mission</h1>
            <p className="text-xs text-white/50">Brief pentru creatori</p>
          </div>
        </div>
      </header>

      <article className="mx-auto max-w-3xl px-4 py-6">
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 sm:p-6">
          <div className="flex items-start gap-3">
            {mission.product_image ? (
              <div className="relative h-24 w-24 flex-shrink-0 overflow-hidden rounded-xl border border-white/10 bg-white/5">
                <Image
                  src={mission.product_image}
                  alt={mission.product_title ?? mission.title}
                  fill
                  sizes="96px"
                  className="object-cover"
                />
              </div>
            ) : (
              <div className="flex h-24 w-24 flex-shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5">
                <Trophy className="h-8 w-8 text-yellow-300" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <h2 className="text-2xl font-black leading-tight">{mission.title}</h2>
              {mission.product_title ? (
                <p className="mt-1 text-sm text-white/55">{mission.product_title}</p>
              ) : null}
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2 text-xs">
            <span className="inline-flex items-center gap-1 rounded-full bg-yellow-400/15 px-3 py-1.5 font-bold text-yellow-300">
              <Coins className="h-3.5 w-3.5" /> {formatPrize(mission.prize_amount_minor, mission.prize_currency)}
            </span>
            {mission.bounty_per_sale_minor > 0 ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-green-400/15 px-3 py-1.5 font-bold text-green-300">
                +{(mission.bounty_per_sale_minor / 100).toFixed(2)}/vânzare
              </span>
            ) : null}
            <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-3 py-1.5 text-white/70">
              <Clock className="h-3.5 w-3.5" /> {formatRemaining(mission.ends_at)}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-3 py-1.5 text-white/70">
              <Users className="h-3.5 w-3.5" /> {mission.submissions_count} înscrieri
            </span>
          </div>

          {mission.brief ? (
            <section className="mt-6">
              <h3 className="text-sm font-black uppercase tracking-wider text-white/50">Brief</h3>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-white/80">{mission.brief}</p>
            </section>
          ) : null}

          {mission.format_hint ? (
            <section className="mt-6 rounded-xl border border-white/10 bg-black/20 p-4">
              <h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-wider text-white/50">
                <Video className="h-4 w-4" /> Format
              </h3>
              <p className="mt-2 text-sm leading-6 text-white/75">{mission.format_hint}</p>
            </section>
          ) : null}

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/upload"
              className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl bg-[#7C3AED] px-4 py-3 text-sm font-black text-white hover:bg-[#6D28D9] transition"
            >
              Publică un clip
            </Link>
            {mission.product_id ? (
              <Link
                href={`/product/${mission.product_id}`}
                className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl border border-white/10 px-4 py-3 text-sm font-bold text-white hover:bg-white/5 transition"
              >
                Vezi produsul
              </Link>
            ) : null}
          </div>
        </div>
      </article>
    </main>
  );
}