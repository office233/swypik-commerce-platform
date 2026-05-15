import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { timingSafeEqual } from "crypto";

export const dynamic = "force-dynamic";

const SYMBOLS = ["RON", "USD", "GBP", "PLN", "HUF", "CZK", "CHF", "SEK", "NOK", "DKK"];

async function authorize(req: Request) {
  const authHeader = req.headers.get("authorization");
  const token =
    authHeader?.replace("Bearer ", "") ||
    req.headers.get("x-cron-secret") ||
    req.headers.get("cron-secret") ||
    "";
  const expected = process.env.CRON_SECRET || "";
  if (!expected || !token) return false;
  if (Buffer.byteLength(token) !== Buffer.byteLength(expected)) return false;
  return timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}

export async function GET(req: Request) {
  if (!(await authorize(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = `https://api.exchangerate.host/latest?base=EUR&symbols=${SYMBOLS.join(",")}`;
  let data: { rates?: Record<string, number> } = {};
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      return NextResponse.json({ error: "upstream_failed", status: res.status }, { status: 502 });
    }
    data = await res.json();
  } catch (err) {
    return NextResponse.json({ error: "upstream_fetch_error", message: (err as Error).message }, { status: 502 });
  }

  const rates = data?.rates || {};
  let updated = 0;
  for (const quote of SYMBOLS) {
    const rate = rates[quote];
    if (typeof rate !== "number" || !isFinite(rate) || rate <= 0) continue;
    try {
      await dbQuery(
        `INSERT INTO fx_rates (base, quote, rate, fetched_at)
         VALUES ('EUR', $1, $2, now())
         ON CONFLICT (base, quote) DO UPDATE SET rate = EXCLUDED.rate, fetched_at = now()`,
        [quote, rate],
      );
      updated++;
    } catch (err) {
      console.warn("[cron/refresh-fx] failed for", quote, (err as Error).message);
    }
  }
  // Ensure EUR self-rate
  await dbQuery(
    `INSERT INTO fx_rates (base, quote, rate, fetched_at)
     VALUES ('EUR','EUR', 1.0, now())
     ON CONFLICT (base, quote) DO UPDATE SET rate = 1.0, fetched_at = now()`,
  );

  return NextResponse.json({ updated, ts: new Date().toISOString() });
}

export async function POST(req: Request) {
  return GET(req);
}
