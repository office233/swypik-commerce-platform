/**
 * Admin: block or unblock a user from placing any future orders.
 *
 *   POST /api/admin/users/<uuid>/fraud-block
 *   body: { action: "block" | "unblock", reason: string }
 */
import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { hasAdminSession, isAdminRequest } from "@/lib/security/admin-auth";
import { setUserFraudBlock } from "@/lib/risk/user-block";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ok = (await hasAdminSession()) || isAdminRequest(req);
  if (!ok) return NextResponse.json({ error: "Neautorizat" }, { status: 403 });

  const { id: userId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(userId)) {
    return NextResponse.json({ error: "Invalid user id" }, { status: 400 });
  }

  let body: any;
  try { body = await req.json(); } catch { body = {}; }
  const action = String(body?.action || "").toLowerCase();
  const reason = String(body?.reason || "").slice(0, 500).trim();
  if (action !== "block" && action !== "unblock") {
    return NextResponse.json({ error: "action must be block|unblock" }, { status: 400 });
  }
  if (!reason) {
    return NextResponse.json({ error: "reason required" }, { status: 400 });
  }

  const { rows } = await dbQuery<{ id: string }>(`SELECT id::text FROM users WHERE id = $1 LIMIT 1`, [userId]);
  if (!rows[0]) return NextResponse.json({ error: "User not found" }, { status: 404 });

  await setUserFraudBlock({
    userId,
    blocked: action === "block",
    reason,
    by: "admin",
  });

  return NextResponse.json({ success: true, action, userId });
}
