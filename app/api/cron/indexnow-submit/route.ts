import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HOST = "swypik.com";
const BASE = `https://${HOST}`;
const ENDPOINT = "https://api.indexnow.org/IndexNow";

function authOk(t: string | null | undefined) {
  const e = process.env.CRON_SECRET || "";
  return Boolean(t && e && t === e);
}

async function collectUrls(limit: number): Promise<string[]> {
  const urls: string[] = [`${BASE}/`, `${BASE}/feed`, `${BASE}/explore`, `${BASE}/best`, `${BASE}/shop`];
  try {
    const { rows } = await dbQuery<{ slug: string }>(`SELECT slug FROM marketplace_products WHERE status='active' ORDER BY updated_at DESC NULLS LAST LIMIT 2000`);
    for (const r of rows) urls.push(`${BASE}/p/${r.slug}`);
  } catch {}
  try {
    const { rows } = await dbQuery<{ id: string }>(`SELECT id::text FROM ae_products WHERE status='active' ORDER BY updated_at DESC NULLS LAST LIMIT 3000`);
    for (const r of rows) urls.push(`${BASE}/ae/${r.id}`);
  } catch {}
  try {
    const { rows } = await dbQuery<{ id: string }>(`SELECT id::text FROM videos WHERE status='active' ORDER BY published_at DESC NULLS LAST LIMIT 1000`);
    for (const r of rows) urls.push(`${BASE}/video/${r.id}`);
  } catch {}
  try {
    const { rows } = await dbQuery<{ slug: string }>(`SELECT slug FROM taxonomy_nodes WHERE slug IS NOT NULL LIMIT 500`);
    for (const r of rows) urls.push(`${BASE}/c/${r.slug}`);
  } catch {}
  return Array.from(new Set(urls)).slice(0, limit);
}

async function submitBatch(key: string, keyLoc: string, urlList: string[]) {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({ host: HOST, key, keyLocation: keyLoc, urlList }),
  }).catch((e) => ({ ok: false, status: 0, text: async () => String(e) } as Response));
  let text = "";
  try { text = await res.text(); } catch {}
  return { ok: res.ok, status: res.status, body: text.slice(0, 400) };
}

export async function POST(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : null;
  if (!authOk(token)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const key = process.env.INDEXNOW_KEY;
  if (!key) return NextResponse.json({ error: "no_key" }, { status: 500 });
  const keyLoc = `${BASE}/${key}.txt`;

  const u = new URL(req.url);
  const cap = Math.min(Number(u.searchParams.get("limit") || 10000), 10000);

  let bodyUrls: string[] = [];
  try {
    if (req.headers.get("content-type")?.includes("application/json")) {
      const j = (await req.json().catch(() => null)) as { urls?: string[] } | null;
      if (Array.isArray(j?.urls)) bodyUrls = j!.urls.filter((x) => typeof x === "string" && x.startsWith(BASE));
    }
  } catch {}

  const urls = bodyUrls.length > 0 ? bodyUrls.slice(0, cap) : await collectUrls(cap);
  if (urls.length === 0) return NextResponse.json({ ok: true, submitted: 0 });

  const BATCH = 1000;
  const results: Array<{ batch: number; status: number; ok: boolean; body?: string }> = [];
  let submitted = 0;
  for (let i = 0; i < urls.length; i += BATCH) {
    const slice = urls.slice(i, i + BATCH);
    const r = await submitBatch(key, keyLoc, slice);
    results.push({ batch: i / BATCH + 1, status: r.status, ok: r.ok, body: r.ok ? undefined : r.body });
    if (r.ok) submitted += slice.length;
    if (!r.ok && r.status >= 400 && r.status !== 429) break;
  }
  return NextResponse.json({ ok: true, total: urls.length, submitted, batches: results });
}
export async function GET(req: Request) { return POST(req); }
