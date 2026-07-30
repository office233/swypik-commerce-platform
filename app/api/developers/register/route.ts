/**
 * POST /api/developers/register — înregistrare cont dezvoltator.
 *
 * Necesită user logat (orice rol). Contul intră cu status='pending';
 * aprobarea se face din Multi-ERP prin /api/internal/moderation/decide
 * (type="developer").
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { dbQuery } from "@/lib/db";
import { logger } from "@/lib/logger";
import { getAuthUser } from "@/lib/auth/getAuthUser";
import { withErrorHandling } from "@/lib/api-handler";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const schema = z.object({
  company: z.string().min(2).max(200),
  website: z.string().url().max(500).optional(),
});

export const POST = withErrorHandling(async function POST(req: Request) {
  const user = await getAuthUser();
  if (!user.userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation", details: parsed.error.flatten() }, { status: 400 });
  }

  const { rows: existing } = await dbQuery<{ id: string; status: string }>(
    `SELECT id, status FROM developer_accounts WHERE user_id = $1 LIMIT 1`,
    [user.userId],
  );
  if (existing.length > 0) {
    return NextResponse.json(
      { error: "already_registered", status: existing[0].status },
      { status: 409 },
    );
  }

  const { rows } = await dbQuery<{ id: string }>(
    `INSERT INTO developer_accounts (user_id, company, website, status)
     VALUES ($1, $2, $3, 'pending')
     RETURNING id`,
    [user.userId, parsed.data.company, parsed.data.website ?? null],
  );

  logger.info({ developer_id: rows[0].id, user_id: user.userId }, "[developers] account registered (pending)");
  return NextResponse.json({ id: rows[0].id, status: "pending" }, { status: 201 });
});
