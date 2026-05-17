import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth/getAuthUser";
import { dbQuery } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getAuthUser();
  const { id } = await params;
  if (!user.userId) return NextResponse.json({ saved: false });

  const { rows } = await dbQuery<{ id: string }>(
    `SELECT id FROM saved_products WHERE user_id = $1 AND product_id = $2 LIMIT 1`,
    [user.userId, id],
  );
  return NextResponse.json({ saved: rows.length > 0 });
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getAuthUser();
  if (!user.userId) return NextResponse.json({ error: "unauth" }, { status: 401 });
  const { id } = await params;

  const { rows } = await dbQuery<{ id: string }>(
    `INSERT INTO saved_products (user_id, product_id)
     VALUES ($1, $2)
     ON CONFLICT (user_id, product_id) DO NOTHING
     RETURNING id`,
    [user.userId, id],
  );

  return NextResponse.json({ saved: true, inserted: rows.length > 0 });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getAuthUser();
  if (!user.userId) return NextResponse.json({ error: "unauth" }, { status: 401 });
  const { id } = await params;

  await dbQuery(
    `DELETE FROM saved_products WHERE user_id = $1 AND product_id = $2`,
    [user.userId, id],
  );
  return NextResponse.json({ saved: false });
}
