/**
 * GET   /api/developers/apps/[id] — detalii app (fără secret).
 * PATCH /api/developers/apps/[id] — editare app (name/description/icon/scopes/webhook/status).
 *       Status permis din portal: draft → review (publicarea finală = alt flux).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { dbQuery } from "@/lib/db";
import { logger } from "@/lib/logger";
import { withErrorHandling } from "@/lib/api-handler";
import { APP_SCOPES, sanitizeScopes } from "@/lib/apps/scopes";
import { requireApprovedDeveloper } from "../../_lib/guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const patchSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  description: z.string().max(2000).nullable().optional(),
  icon_url: z.string().url().max(500).nullable().optional(),
  scopes: z.array(z.enum(APP_SCOPES)).max(APP_SCOPES.length).optional(),
  webhook_url: z.string().url().max(500).nullable().optional(),
  status: z.enum(["draft", "review"]).optional(),
});

async function ownedApp(developerId: string, appId: string) {
  const { rows } = await dbQuery(
    `SELECT id, name, slug, description, icon_url, scopes, webhook_url,
            oauth_client_id, status, created_at, updated_at
       FROM apps WHERE id = $1 AND developer_id = $2 LIMIT 1`,
    [appId, developerId],
  );
  return rows[0] ?? null;
}

export const GET = withErrorHandling(async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireApprovedDeveloper();
  if (!guard.ok) return guard.response;
  const { id } = await params;
  const app = await ownedApp(guard.developer.id, id);
  if (!app) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ app });
});

export const PATCH = withErrorHandling(async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireApprovedDeveloper();
  if (!guard.ok) return guard.response;
  const { id } = await params;
  const app = await ownedApp(guard.developer.id, id);
  if (!app) return NextResponse.json({ error: "not_found" }, { status: 404 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation", details: parsed.error.flatten() }, { status: 400 });
  }
  const d = parsed.data;

  const sets: string[] = [];
  const values: unknown[] = [];
  const push = (col: string, val: unknown) => {
    values.push(val);
    sets.push(`${col} = $${values.length}`);
  };

  if (d.name !== undefined) push("name", d.name);
  if (d.description !== undefined) push("description", d.description);
  if (d.icon_url !== undefined) push("icon_url", d.icon_url);
  if (d.scopes !== undefined) push("scopes", sanitizeScopes(d.scopes));
  if (d.webhook_url !== undefined) push("webhook_url", d.webhook_url);
  if (d.status !== undefined) push("status", d.status);

  if (sets.length === 0) {
    return NextResponse.json({ error: "no_changes" }, { status: 400 });
  }

  values.push(id, guard.developer.id);
  await dbQuery(
    `UPDATE apps SET ${sets.join(", ")}, updated_at = now()
      WHERE id = $${values.length - 1} AND developer_id = $${values.length}`,
    values,
  );

  logger.info({ app_id: id, developer_id: guard.developer.id }, "[developers] app updated");
  return NextResponse.json({ ok: true });
});
