/**
 * GET  /api/developers/apps — apps-urile dezvoltatorului curent.
 * POST /api/developers/apps — creează app nou (client_secret returnat O SINGURĂ DATĂ).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { dbQuery } from "@/lib/db";
import { logger } from "@/lib/logger";
import { withErrorHandling } from "@/lib/api-handler";
import { APP_SCOPES, sanitizeScopes } from "@/lib/apps/scopes";
import { generateSecret, sha256Hex } from "@/lib/apps/auth";
import { requireApprovedDeveloper } from "../_lib/guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const createSchema = z.object({
  name: z.string().min(2).max(120),
  slug: z
    .string()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9][a-z0-9-]*$/, "slug invalid (a-z, 0-9, -)"),
  description: z.string().max(2000).optional(),
  icon_url: z.string().url().max(500).optional(),
  scopes: z.array(z.enum(APP_SCOPES)).max(APP_SCOPES.length).default([]),
  webhook_url: z.string().url().max(500).optional(),
});

export const GET = withErrorHandling(async function GET() {
  const guard = await requireApprovedDeveloper();
  if (!guard.ok) return guard.response;

  const { rows } = await dbQuery(
    `SELECT id, name, slug, description, icon_url, scopes, webhook_url,
            oauth_client_id, status, created_at, updated_at,
            (SELECT count(*) FROM app_installs i
              WHERE i.app_id = a.id AND i.revoked_at IS NULL) AS install_count
       FROM apps a
      WHERE a.developer_id = $1
      ORDER BY a.created_at DESC`,
    [guard.developer.id],
  );
  return NextResponse.json({ apps: rows });
});

export const POST = withErrorHandling(async function POST(req: Request) {
  const guard = await requireApprovedDeveloper();
  if (!guard.ok) return guard.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation", details: parsed.error.flatten() }, { status: 400 });
  }
  const d = parsed.data;

  const { rows: dup } = await dbQuery<{ id: string }>(`SELECT id FROM apps WHERE slug = $1 LIMIT 1`, [d.slug]);
  if (dup.length > 0) {
    return NextResponse.json({ error: "slug_taken" }, { status: 409 });
  }

  const clientId = generateSecret("swkid");
  const clientSecret = generateSecret("swksec");

  const { rows } = await dbQuery<{ id: string }>(
    `INSERT INTO apps (developer_id, name, slug, description, icon_url, scopes,
                       webhook_url, oauth_client_id, oauth_client_secret_hash, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'draft')
     RETURNING id`,
    [
      guard.developer.id,
      d.name,
      d.slug,
      d.description ?? null,
      d.icon_url ?? null,
      sanitizeScopes(d.scopes),
      d.webhook_url ?? null,
      clientId,
      sha256Hex(clientSecret),
    ],
  );

  logger.info({ app_id: rows[0].id, developer_id: guard.developer.id }, "[developers] app created");

  // client_secret afișat O SINGURĂ DATĂ — în DB există doar hash-ul.
  return NextResponse.json(
    { id: rows[0].id, oauth_client_id: clientId, oauth_client_secret: clientSecret },
    { status: 201 },
  );
});
