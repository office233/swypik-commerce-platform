/**
 * OAuth2 simplificat — pas 1: autorizare.
 *
 * GET  /api/apps/oauth/authorize?client_id=...&scopes=read_orders,read_products
 *   → info pentru consent screen (app + scopes cerute). Necesită seller logat.
 *
 * POST /api/apps/oauth/authorize  { client_id, scopes: [...] }
 *   → seller-ul acceptă → creăm/activăm app_install + cod de autorizare
 *     one-time (10 min) pe care app-ul îl schimbă pe token la /oauth/token.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import crypto from "crypto";
import { dbQuery } from "@/lib/db";
import { logger } from "@/lib/logger";
import { withErrorHandling } from "@/lib/api-handler";
import { getAuthUser } from "@/lib/auth/getAuthUser";
import { APP_SCOPES, sanitizeScopes, SCOPE_DESCRIPTIONS } from "@/lib/apps/scopes";
import { sha256Hex } from "@/lib/apps/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface PublishedApp {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon_url: string | null;
  scopes: string[];
}

async function findPublishedApp(clientId: string): Promise<PublishedApp | null> {
  const { rows } = await dbQuery<PublishedApp>(
    `SELECT id, name, slug, description, icon_url, scopes
       FROM apps WHERE oauth_client_id = $1 AND status = 'published' LIMIT 1`,
    [clientId],
  );
  return rows[0] ?? null;
}

export const GET = withErrorHandling(async function GET(req: Request) {
  const user = await getAuthUser();
  if (!user.sellerId) {
    return NextResponse.json({ error: "seller_login_required" }, { status: 401 });
  }

  const url = new URL(req.url);
  const clientId = url.searchParams.get("client_id") || "";
  if (!clientId) return NextResponse.json({ error: "missing_client_id" }, { status: 400 });

  const app = await findPublishedApp(clientId);
  if (!app) return NextResponse.json({ error: "app_not_found" }, { status: 404 });

  const requested = sanitizeScopes((url.searchParams.get("scopes") || "").split(",").map((s) => s.trim()).filter(Boolean));
  // scopes cerute limitate la ce a declarat app-ul; fallback = tot ce a declarat
  const appScopes = sanitizeScopes(app.scopes);
  const effective = requested.length > 0 ? requested.filter((s) => appScopes.includes(s)) : appScopes;

  return NextResponse.json({
    app: { name: app.name, slug: app.slug, description: app.description, icon_url: app.icon_url },
    scopes: effective.map((s) => ({ scope: s, description: SCOPE_DESCRIPTIONS[s] })),
  });
});

const consentSchema = z.object({
  client_id: z.string().min(8),
  scopes: z.array(z.enum(APP_SCOPES)).min(1),
});

export const POST = withErrorHandling(async function POST(req: Request) {
  const user = await getAuthUser();
  if (!user.sellerId) {
    return NextResponse.json({ error: "seller_login_required" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = consentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation", details: parsed.error.flatten() }, { status: 400 });
  }

  const app = await findPublishedApp(parsed.data.client_id);
  if (!app) return NextResponse.json({ error: "app_not_found" }, { status: 404 });

  const appScopes = sanitizeScopes(app.scopes);
  const granted = parsed.data.scopes.filter((s) => appScopes.includes(s));
  if (granted.length === 0) {
    return NextResponse.json({ error: "no_valid_scopes" }, { status: 400 });
  }

  // upsert install activ (fără token încă — tokenul apare la exchange)
  const { rows: installRows } = await dbQuery<{ id: string }>(
    `INSERT INTO app_installs (app_id, seller_id, granted_scopes)
     VALUES ($1, $2, $3)
     ON CONFLICT (app_id, seller_id) WHERE revoked_at IS NULL
     DO UPDATE SET granted_scopes = EXCLUDED.granted_scopes
     RETURNING id`,
    [app.id, user.sellerId, granted],
  );

  // cod one-time, 10 minute
  const code = `swkc_${crypto.randomBytes(24).toString("hex")}`;
  await dbQuery(
    `INSERT INTO app_oauth_codes (code_hash, app_id, seller_id, scopes, expires_at)
     VALUES ($1, $2, $3, $4, now() + interval '10 minutes')`,
    [sha256Hex(code), app.id, user.sellerId, granted],
  );

  logger.info({ app_id: app.id, seller_id: user.sellerId, install_id: installRows[0]?.id }, "[apps-oauth] consent granted");
  return NextResponse.json({ code, expires_in: 600 });
});
