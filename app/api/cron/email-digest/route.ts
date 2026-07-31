import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { dbQuery } from "@/lib/db";
import { runCron } from "@/lib/cron/runCron";
import { sendEmail, unsubscribeUrl } from "@/lib/email/service";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorize(req: Request): boolean {
  // Acceptă și x-cron-secret (standardul celorlalte joburi), și Bearer.
  const token =
    (req.headers.get("authorization") || "").replace("Bearer ", "") ||
    req.headers.get("x-cron-secret") ||
    "";
  const expected = process.env.CRON_SECRET || "";
  if (!expected || !token) return false;
  if (Buffer.byteLength(token) !== Buffer.byteLength(expected)) return false;
  return timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://swypik.com").replace(/\/$/, "");

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"'"]/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"} as Record<string,string>)[c] || c);
}

type DigestProduct = { id: string; title: string; slug: string | null; image_url: string | null; price_cents: number | null; currency: string };
type DigestVideo = { id: string; title: string | null; thumbnail_url: string | null; creator_name: string | null };

async function topTrendingProducts(): Promise<DigestProduct[]> {
  const sql = `
    SELECT p.id::text, p.title, p.slug, p.image_url, p.price_cents,
           COALESCE(p.currency::text, 'EUR') AS currency
      FROM marketplace_products p
     WHERE p.status='active' AND COALESCE(p.is_adult,false)=false
     ORDER BY p.created_at DESC NULLS LAST
     LIMIT 5`;
  const { rows } = await dbQuery<DigestProduct>(sql);
  return rows;
}

async function topVideosFromFollows(userId: string): Promise<DigestVideo[]> {
  const sql = `
    SELECT v.id::text, v.title, v.thumbnail_url,
           u.display_name AS creator_name
      FROM videos v
      JOIN follows f ON f.following_user_id = v.creator_id AND f.follower_user_id = $1
      LEFT JOIN users u ON u.id = v.creator_id
     WHERE v.visibility='public' AND v.is_hidden=false
       AND v.status='ready' AND v.effective_label='safe'
       AND v.published_at >= NOW() - INTERVAL '7 days'
     ORDER BY COALESCE(v.view_count,0) DESC, v.published_at DESC NULLS LAST
     LIMIT 3`;
  try {
    const { rows } = await dbQuery<DigestVideo>(sql, [userId]);
    return rows;
  } catch {
    return [];
  }
}

function formatPrice(cents: number | null, currency: string): string {
  if (cents == null) return "";
  const v = (cents / 100).toFixed(2);
  return `${v} ${currency}`;
}

function renderDigestHtml(opts: {
  email: string;
  displayName: string | null;
  products: DigestProduct[];
  videos: DigestVideo[];
}): string {
  const unsubUrl = unsubscribeUrl(opts.email);
  const greeting = opts.displayName ? `Salut, ${escapeHtml(opts.displayName)}!` : "Salut!";

  const productCards = opts.products.map((p) => {
    const href = `${APP_URL}/product/${escapeHtml(p.slug || p.id)}`;
    const img = p.image_url ? `<img src="${escapeHtml(p.image_url)}" alt="" style="width:100%;max-width:200px;height:auto;border-radius:8px"/>` : "";
    const price = formatPrice(p.price_cents, p.currency);
    return `
      <td style="padding:8px;vertical-align:top;width:33%">
        <a href="${escapeHtml(href)}" style="text-decoration:none;color:#0a0a0a">
          ${img}
          <div style="font-size:13px;font-weight:600;margin-top:6px">${escapeHtml(p.title)}</div>
          <div style="font-size:12px;color:#7C3AED;margin-top:2px">${escapeHtml(price)}</div>
        </a>
      </td>`;
  }).join("");

  const videoItems = opts.videos.map((v) => {
    const href = `${APP_URL}/video/${escapeHtml(v.id)}`;
    return `
      <li style="margin:8px 0">
        <a href="${escapeHtml(href)}" style="color:#0a0a0a;text-decoration:none">
          <b>${escapeHtml(v.title || "Video nou")}</b>
          ${v.creator_name ? `<span style="color:#666"> — ${escapeHtml(v.creator_name)}</span>` : ""}
        </a>
      </li>`;
  }).join("");

  return `<!doctype html><html><body style="font-family:system-ui,-apple-system,sans-serif;background:#fff;color:#0a0a0a;margin:0;padding:0">
  <div style="max-width:600px;margin:0 auto;padding:24px">
    <h1 style="color:#7C3AED;font-size:24px;margin:0 0 8px">Swypik — Săptămâna ta</h1>
    <p style="font-size:14px;color:#333;margin:0 0 24px">${greeting} Iată ce e nou în feed.</p>

    ${opts.products.length ? `
      <h2 style="font-size:16px;margin:16px 0 8px">🔥 Produse trending</h2>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${productCards}</tr></table>
    ` : ""}

    ${opts.videos.length ? `
      <h2 style="font-size:16px;margin:24px 0 8px">📹 De la creatorii tăi</h2>
      <ul style="padding-left:18px;margin:0">${videoItems}</ul>
    ` : ""}

    <div style="margin-top:32px;padding-top:16px;border-top:1px solid #eee;text-align:center">
      <a href="${escapeHtml(APP_URL)}/explore" style="display:inline-block;background:#7C3AED;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-size:14px">Deschide Swypik</a>
    </div>
    <p style="font-size:11px;color:#999;text-align:center;margin-top:24px">
      <a href="${escapeHtml(unsubUrl)}" style="color:#999">Dezabonează-te</a>
    </p>
  </div>
</body></html>`;
}

async function runDigest() {
  const batchSize = 50;
  const { rows: candidates } = await dbQuery<{ id: string; email: string; display_name: string | null }>(
    `SELECT u.id::text, u.email, u.display_name
       FROM users u
      WHERE u.email IS NOT NULL
        AND u.email_verified_at IS NOT NULL
        AND (u.last_digest_sent_at IS NULL OR u.last_digest_sent_at < NOW() - INTERVAL '6 days')
        AND NOT EXISTS (SELECT 1 FROM email_unsubscribes eu WHERE eu.email_lower = lower(u.email))
      ORDER BY u.last_digest_sent_at NULLS FIRST
      LIMIT $1`,
    [batchSize]
  );

  if (candidates.length === 0) return { sent: 0, skipped: 0, batch: 0 };

  // Shared trending products (one query for the batch).
  const products = await topTrendingProducts();

  let sent = 0;
  let skipped = 0;

  for (const u of candidates) {
    try {
      const videos = await topVideosFromFollows(u.id);
      if (products.length === 0 && videos.length === 0) {
        skipped++;
        continue;
      }
      const html = renderDigestHtml({ email: u.email, displayName: u.display_name, products, videos });
      const ok = await sendEmail({
        to: u.email,
        subject: "Swypik — Săptămâna ta în feed",
        html,
        marketing: true,
      });
      if (ok) {
        await dbQuery(`UPDATE users SET last_digest_sent_at = NOW() WHERE id = $1`, [u.id]);
        sent++;
      } else {
        skipped++;
      }
    } catch (e) {
      console.warn("[email-digest] failed for", u.email, (e as Error)?.message);
      skipped++;
    }
    // Rate limit: 1s between sends within batch (Resend free tier safe).
    await new Promise((r) => setTimeout(r, 1000));
  }

  return { sent, skipped, batch: candidates.length };
}

export async function POST(req: Request) {
  if (!authorize(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await runCron("email-digest", runDigest);
  return NextResponse.json({ ok: true, ...result });
}

export async function GET(req: Request) {
  return POST(req);
}
