// Fix bug: marketplace_products.images nu există, e image_url
import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";

export const dynamic = "force-dynamic";

type Row = {
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
  max_winners: number | null;
  starts_at: string;
  ends_at: string | null;
  submissions_count: number;
};

export async function GET(req: Request) {
  const url = new URL(req.url);
  const limitParam = Number(url.searchParams.get("limit") || 20);
  const limit = Number.isFinite(limitParam)
    ? Math.max(1, Math.min(Math.trunc(limitParam), 50))
    : 20;

  try {
    const { rows } = await dbQuery<Row>(
      `SELECT
         m.id,
         m.slug,
         m.title,
         m.brief,
         m.format_hint,
         m.product_id,
         p.title                                       AS product_title,
         p.image_url                                   AS product_image,
         m.prize_amount_minor,
         m.prize_currency,
         m.bounty_per_sale_minor,
         m.max_winners,
         m.starts_at,
         m.ends_at,
         (SELECT COUNT(*)::int FROM creator_mission_submissions s WHERE s.mission_id = m.id) AS submissions_count
       FROM creator_missions m
       LEFT JOIN marketplace_products p ON p.id = m.product_id
       WHERE m.status = 'active'
         AND (m.ends_at IS NULL OR m.ends_at > now())
       ORDER BY (m.ends_at IS NULL), m.ends_at ASC, m.starts_at DESC
       LIMIT $1`,
      [limit],
    );

    return NextResponse.json(
      {
        missions: rows.map((r) => ({
          id: r.id,
          slug: r.slug,
          title: r.title,
          brief: r.brief,
          formatHint: r.format_hint,
          product: r.product_id
            ? { id: r.product_id, title: r.product_title, image: r.product_image }
            : null,
          prize: {
            amountMinor: r.prize_amount_minor,
            currency: r.prize_currency,
            bountyPerSaleMinor: r.bounty_per_sale_minor,
          },
          maxWinners: r.max_winners,
          startsAt: r.starts_at,
          endsAt: r.ends_at,
          submissionsCount: r.submissions_count,
        })),
      },
      { headers: { "cache-control": "public, s-maxage=60, stale-while-revalidate=300" } },
    );
  } catch (err) {
    console.error("[api/missions] GET failed", err);
    return NextResponse.json({ error: "internal_error", missions: [] }, { status: 500 });
  }
}
