/**
 * Auth pentru API-ul aplicațiilor terțe.
 *
 * Bearer token (swk_app_...) → app_install activ → { sellerId, appId, scopes }.
 * Token-ul NU e stocat în clar — doar sha256(token) în app_installs.api_token_hash.
 *
 * Usage într-un route:
 *   const ctx = await getAppContext(req);
 *   if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
 *   if (!ctx.scopes.includes("read_orders")) return insufficientScope("read_orders");
 */
import crypto from "crypto";
import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import type { AppScope } from "./scopes";

export interface AppContext {
  installId: string;
  appId: string;
  appSlug: string;
  sellerId: string;
  scopes: AppScope[];
}

export function sha256Hex(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

/** Generează un secret/token aleator cu prefix (afișat o singură dată). */
export function generateSecret(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(24).toString("hex")}`;
}

export async function getAppContext(req: Request): Promise<AppContext | null> {
  const auth = req.headers.get("authorization") || "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const token = match[1].trim();
  if (token.length < 16) return null;

  const { rows } = await dbQuery<{
    install_id: string;
    app_id: string;
    app_slug: string;
    seller_id: string;
    granted_scopes: AppScope[];
  }>(
    `SELECT i.id AS install_id, i.app_id, a.slug AS app_slug,
            i.seller_id, i.granted_scopes
       FROM app_installs i
       JOIN apps a ON a.id = i.app_id
      WHERE i.api_token_hash = $1
        AND i.revoked_at IS NULL
        AND a.status = 'published'
      LIMIT 1`,
    [sha256Hex(token)],
  );
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    installId: r.install_id,
    appId: r.app_id,
    appSlug: r.app_slug,
    sellerId: r.seller_id,
    scopes: r.granted_scopes ?? [],
  };
}

export function insufficientScope(scope: AppScope): NextResponse {
  return NextResponse.json(
    { error: "insufficient_scope", required_scope: scope },
    { status: 403 },
  );
}
