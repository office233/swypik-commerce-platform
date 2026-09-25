import { withErrorHandling } from "@/lib/api-handler";
import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth/getAuthUser";
import { dbQuery } from "@/lib/db";
import { rateLimit } from "@/lib/security/rate-limit";
import { isUuid } from "@/lib/validation/uuid";

export const dynamic = "force-dynamic";

async function GET_impl(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getAuthUser();
  const { id } = await params;
  if (!user.userId || !isUuid(id)) return NextResponse.json({ saved: false });

  const { rows } = await dbQuery<{ id: string }>(
    `SELECT id FROM saved_products WHERE user_id = $1 AND product_id = $2 LIMIT 1`,
    [user.userId, id],
  );
  return NextResponse.json({ saved: rows.length > 0 });
}

async function POST_impl(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getAuthUser();
  if (!user.userId) return NextResponse.json({ error: "unauth" }, { status: 401 });
  const rl = await rateLimit("productSave", user.userId);
  if (!rl.success) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ code: "invalid_product" }, { status: 400 });

  // Doar produse existente și publice pot fi salvate.
  const { rows } = await dbQuery<{ id: string }>(
    `INSERT INTO saved_products (user_id, product_id)
     SELECT $1, p.id FROM marketplace_products p
      WHERE p.id = $2::uuid AND p.status = 'active' AND p.effective_label = 'safe'
     ON CONFLICT (user_id, product_id) DO NOTHING
     RETURNING id`,
    [user.userId, id],
  );

  return NextResponse.json({ saved: true, inserted: rows.length > 0 });
}

async function DELETE_impl(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getAuthUser();
  if (!user.userId) return NextResponse.json({ error: "unauth" }, { status: 401 });
  const rl = await rateLimit("productSave", user.userId);
  if (!rl.success) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ code: "invalid_product" }, { status: 400 });

  await dbQuery(
    `DELETE FROM saved_products WHERE user_id = $1 AND product_id = $2`,
    [user.userId, id],
  );
  return NextResponse.json({ saved: false });
}

export const GET = withErrorHandling(GET_impl);
export const POST = withErrorHandling(POST_impl);
export const DELETE = withErrorHandling(DELETE_impl);
