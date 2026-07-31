/**
 * OAuth2 simplificat — pas 2: exchange code → token.
 *
 * POST /api/apps/oauth/token
 *   Body: { client_id, client_secret, code }
 *   → { access_token: "swk_app_...", token_type: "Bearer", scopes: [...] }
 *
 * Tokenul e afișat o singură dată; în DB doar sha256 în app_installs.api_token_hash.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { dbQuery, withTransaction } from "@/lib/db";
import { logger } from "@/lib/logger";
import { withErrorHandling } from "@/lib/api-handler";
import { generateSecret, sha256Hex } from "@/lib/apps/auth";
import { rateLimit, getClientIP } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const schema = z.object({
  client_id: z.string().min(8),
  client_secret: z.string().min(16),
  code: z.string().min(16),
});

export const POST = withErrorHandling(async function POST(req: Request) {
  const rl = await rateLimit("oauth-token-ip", getClientIP(req), { limit: 10, window: 300 });
  if (!rl.success) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", details: parsed.error.flatten() }, { status: 400 });
  }
  const { client_id, client_secret, code } = parsed.data;

  // 1. validare client
  const { rows: appRows } = await dbQuery<{ id: string; secret_hash: string }>(
    `SELECT id, oauth_client_secret_hash AS secret_hash
       FROM apps WHERE oauth_client_id = $1 AND status = 'published' LIMIT 1`,
    [client_id],
  );
  if (appRows.length === 0 || appRows[0].secret_hash !== sha256Hex(client_secret)) {
    return NextResponse.json({ error: "invalid_client" }, { status: 401 });
  }
  const appId = appRows[0].id;

  // 2. consumă codul + emite token atomic
  const result = await withTransaction(async (q) => {
    const { rows: codeRows } = await q<{ id: string; seller_id: string; scopes: string[] }>(
      `SELECT id, seller_id, scopes
         FROM app_oauth_codes
        WHERE code_hash = $1 AND app_id = $2
          AND used_at IS NULL AND expires_at > now()
        FOR UPDATE`,
      [sha256Hex(code), appId],
    );
    if (codeRows.length === 0) return null;
    const c = codeRows[0];

    await q(`UPDATE app_oauth_codes SET used_at = now() WHERE id = $1`, [c.id]);

    const token = generateSecret("swk_app");
    const { rowCount } = await q(
      `UPDATE app_installs
          SET api_token_hash = $1, granted_scopes = $2
        WHERE app_id = $3 AND seller_id = $4 AND revoked_at IS NULL`,
      [sha256Hex(token), c.scopes, appId, c.seller_id],
    );
    if (rowCount === 0) return null;

    return { token, scopes: c.scopes };
  });

  if (!result) {
    return NextResponse.json({ error: "invalid_grant" }, { status: 400 });
  }

  logger.info({ app_id: appId }, "[apps-oauth] token issued");
  return NextResponse.json({
    access_token: result.token,
    token_type: "Bearer",
    scopes: result.scopes,
  });
});
