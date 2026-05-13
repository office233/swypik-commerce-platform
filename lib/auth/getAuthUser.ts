import { cookies } from "next/headers";
import crypto from "crypto";
import { dbQuery } from "@/lib/db";
import { hashAdminSessionToken, getAdminCookieName } from "@/lib/security/admin-auth";

export type AuthRole = "shopper" | "creator" | "seller" | "admin" | "guest";

export type AuthUser = {
  role: AuthRole;
  userId: string | null;
  sellerId: string | null;
  isAdmin: boolean;
  email: string | null;
};

const SHOPPER_COOKIE = "swypik_session";
const SELLER_COOKIE = "seller_session";

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

async function resolveUserBySession(token: string): Promise<{ userId: string; role: string; email: string | null } | null> {
  const { rows } = await dbQuery<{ user_id: string; role: string; email: string | null }>(
    `SELECT s.user_id, u.role, u.email
       FROM user_sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.session_token_hash = $1
        AND s.expires_at > now()
        AND s.revoked_at IS NULL
      LIMIT 1`,
    [sha256(token)],
  );
  const row = rows[0];
  if (!row) return null;
  return { userId: row.user_id, role: row.role || "shopper", email: row.email };
}

async function resolveSellerBySession(token: string): Promise<string | null> {
  const { rows } = await dbQuery<{ seller_id: string }>(
    `SELECT seller_id FROM seller_sessions
      WHERE token = $1 AND expires_at > now()
      LIMIT 1`,
    [sha256(token)],
  );
  return rows[0]?.seller_id ?? null;
}

async function resolveAdminBySession(token: string): Promise<boolean> {
  const { rows } = await dbQuery(
    `SELECT 1 FROM admin_sessions WHERE token = $1 AND expires_at > now() LIMIT 1`,
    [hashAdminSessionToken(token)],
  );
  return rows.length > 0;
}

const GUEST: AuthUser = { role: "guest", userId: null, sellerId: null, isAdmin: false, email: null };

export async function getAuthUser(): Promise<AuthUser> {
  const store = await cookies();

  const adminToken = store.get(getAdminCookieName())?.value;
  const adminVerified = adminToken ? await resolveAdminBySession(adminToken).catch(() => false) : false;

  const sellerToken = store.get(SELLER_COOKIE)?.value;
  const sellerId = sellerToken ? await resolveSellerBySession(sellerToken).catch(() => null) : null;

  const shopperToken = store.get(SHOPPER_COOKIE)?.value;
  const userInfo = shopperToken ? await resolveUserBySession(shopperToken).catch(() => null) : null;

  if (adminVerified) {
    return {
      role: "admin",
      userId: userInfo?.userId ?? null,
      sellerId,
      isAdmin: true,
      email: userInfo?.email ?? null,
    };
  }

  if (sellerId) {
    return { role: "seller", userId: userInfo?.userId ?? null, sellerId, isAdmin: false, email: userInfo?.email ?? null };
  }

  if (userInfo) {
    const role = (userInfo.role === "creator" ? "creator" : "shopper") as AuthRole;
    return { role, userId: userInfo.userId, sellerId: null, isAdmin: false, email: userInfo.email };
  }

  return GUEST;
}

export async function requireRole(roles: AuthRole[]): Promise<AuthUser> {
  const user = await getAuthUser();
  if (!roles.includes(user.role)) {
    throw new Error(`Forbidden: requires one of [${roles.join(", ")}], got ${user.role}`);
  }
  return user;
}
