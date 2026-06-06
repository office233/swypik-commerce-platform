import type { Metadata } from "next";
import Link from "next/link";
import { dbQuery } from "@/lib/db";
import { Swords, Clock, MessageSquare, TrendingUp } from "lucide-react";
import { getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("pageMeta.battles");
  return {
    title: t("title") + " — Swypik",
    description: t("description"),
  };
}

type PostRow = {
  id: string;
  slug: string | null;
  format: string;
  title: string;
  body: string | null;
  vote_count: number;
  comment_count: number;
  ends_at: string | null;
  created_at: string;
  author_handle: string | null;
  author_display: string | null;
};

function fmtRemaining(
  endsAt: string | null,
  t: (key: any, vars?: any) => string,
): string {
  if (!endsAt) return "Permanent";
  const ms = new Date(endsAt).getTime() - Date.now();
  if (ms <= 0) return t("incheiat");
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  if (d > 0) return `${d}z ${h}h`;
  return `${h}h`;
}

export default async function BattlesPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string }>;
}) {
  const t = await getTranslations("battles");
  const tBattlesPage = await getTranslations("battlesPage");
  const sp = await searchParams;
  const sort = sp.sort === "new" ? "new" : sp.sort === "ending" ? "ending" : "hot";

  const orderBy =
    sort === "new"
      ? "p.created_at DESC"
      : sort === "ending"
        ? "(p.ends_at IS NULL), p.ends_at ASC"
        : "p.hot_score DESC, p.created_at DESC";

  const { rows } = await dbQuery<PostRow>(
    `SELECT
       p.id, p.slug, p.format, p.title, p.body,
       p.vote_count, p.comment_count, p.ends_at, p.created_at,
       u.username    AS author_handle,
       u.display_name AS author_display
     FROM community_posts p
     LEFT JOIN users u ON u.id = p.author_user_id
     WHERE p.status = 'active'
       AND p.is_adult = FALSE
       AND p.format = 'battle'
     ORDER BY ${orderBy}
     LIMIT 50`,
  );

  return (
    <main className="min-h-screen bg-[#0D0D0D] text-white pb-24">
      <header className="sticky top-0 z-10 bg-[#0D0D0D]/90 backdrop-blur border-b border-white/10 px-4 py-4">
        <h1 className="text-2xl font-black flex items-center gap-2">
          <Swords className="w-6 h-6 text-red-400" /> Battles
        </h1>
        <p className="text-sm text-white/60 mt-1">

          {t("versusIntreProduseVoteaza")}
        </p>
        <nav className="mt-3 flex gap-2 text-xs">
          {(["hot", "new", "ending"] as const).map((s) => (
            <Link
              key={s}
              href={`/battles?sort=${s}`}
              className={`rounded-full px-3 py-1.5 border ${
                sort === s
                  ? "bg-[#7C3AED] border-[#7C3AED] text-white"
                  : "border-white/10 text-white/60 hover:bg-white/5"
              }`}
            >
              {s === "hot" ? "🔥 Hot" : s === "new" ? "🆕 Noi" : tBattlesPage("seInchid")}
            </Link>
          ))}
        </nav>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-6">
        {rows.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-8 text-center text-white/60">

            {t("niciunBattleActivEsti")}{" "}
            <Link href="/post/new?format=battle" className="text-[#7C3AED] underline">

              {t("creeazaUnul")}
            </Link>
          </div>
        ) : (
          <ul className="space-y-3">
            {rows.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/post/${p.slug || p.id}`}
                  className="block rounded-2xl border border-white/10 bg-white/[0.04] p-4 hover:border-red-400/50 transition"
                >
                  <h2 className="font-bold line-clamp-2">{p.title}</h2>
                  {p.body ? (
                    <p className="text-xs text-white/60 mt-1 line-clamp-2">{p.body}</p>
                  ) : null}
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                    <span className="inline-flex items-center gap-1 rounded-full bg-red-400/15 px-2 py-1 text-red-300">
                      <TrendingUp className="w-3 h-3" /> {p.vote_count} voturi
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-1 text-white/60">
                      <MessageSquare className="w-3 h-3" /> {p.comment_count}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-1 text-white/60">
                      <Clock className="w-3 h-3" /> {fmtRemaining(p.ends_at, tBattlesPage)}
                    </span>
                    {p.author_display ? (
                      <span className="ml-auto text-white/40">
                        @{p.author_handle || p.author_display}
                      </span>
                    ) : null}
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
