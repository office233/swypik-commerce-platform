import crypto from "crypto";
import { cookies } from "next/headers";
import { dbQuery } from "@/lib/db";

export const ANON_SESSION_COOKIE = "anon_session";

type CookieStore = Awaited<ReturnType<typeof cookies>>;

export type SocialUserSession = {
  userId: string;
  anonSessionId?: string;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string | undefined | null): value is string {
  return Boolean(value && UUID_RE.test(value));
}

function usernameFromSeed(prefix: string, seed: string): string {
  const compact = seed.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 16);
  return `${prefix}_${compact || crypto.randomBytes(4).toString("hex")}`;
}

async function ensureUuidUser(userId: string, source: string): Promise<string> {
  const username = usernameFromSeed(source, userId);
  const { rows } = await dbQuery<{ id: string }>(
    `INSERT INTO users (id, external_auth_id, username, display_name, locale, role, metadata, last_seen_at)
     VALUES ($1, $2, $3, $4, 'ro', 'shopper', $5::jsonb, NOW())
     ON CONFLICT (id)
     DO UPDATE SET last_seen_at = NOW()
     RETURNING id`,
    [
      userId,
      `${source}:${userId}`,
      username,
      source === "anon" ? "Guest" : "Creator",
      JSON.stringify({ source: `${source}_session` }),
    ],
  );

  return rows[0].id;
}

async function resolveUserSession(sessionToken: string): Promise<string | null> {
  try {
    // New path: hashed token lookup in user_sessions (from new auth flow)
    const tokenHash = crypto.createHash("sha256").update(sessionToken).digest("hex");
    const { rows } = await dbQuery<{ user_id: string }>(
      `SELECT user_id FROM user_sessions
       WHERE session_token_hash = $1
         AND expires_at > NOW()
         AND revoked_at IS NULL
       LIMIT 1`,
      [tokenHash],
    );
    if (rows.length > 0) return rows[0].user_id;
  } catch {
    // table might not exist yet in some envs — fall through
  }
  return null;
}

async function resolveCustomerSession(sessionToken: string): Promise<string | null> {
  try {
    const { rows } = await dbQuery<{
      customer_id: string;
      email: string | null;
      name: string | null;
    }>(
      `SELECT cs.customer_id, c.email, c.name
       FROM customer_sessions cs
       JOIN customers c ON c.id = cs.customer_id
       WHERE cs.token = $1 AND cs.expires_at > NOW()
       LIMIT 1`,
      [sessionToken],
    );

    if (rows.length === 0) return null;

    const customer = rows[0];
    const externalAuthId = `customer:${customer.customer_id}`;
    const { rows: userRows } = await dbQuery<{ id: string }>(
      `INSERT INTO users (external_auth_id, username, display_name, email, locale, role, metadata, last_seen_at)
       VALUES ($1, $2, $3, $4, 'ro', 'shopper', $5::jsonb, NOW())
       ON CONFLICT (external_auth_id) WHERE external_auth_id IS NOT NULL
       DO UPDATE SET
         display_name = COALESCE(EXCLUDED.display_name, users.display_name),
         email = COALESCE(EXCLUDED.email, users.email),
         last_seen_at = NOW()
       RETURNING id`,
      [
        externalAuthId,
        usernameFromSeed("shopper", customer.customer_id),
        customer.name || customer.email || "Shopper",
        customer.email,
        JSON.stringify({ source: "customer_session", customer_id: customer.customer_id }),
      ],
    );

    return userRows[0].id;
  } catch (error) {
    console.warn("[Social Session] Could not resolve customer session", error);
    return null;
  }
}

async function resolveExistingSocialUser(cookieStore: CookieStore): Promise<string | null> {
  const shopperSession = cookieStore.get("swypik_session")?.value;
  if (shopperSession) {
    // Try new hashed-token user_sessions first
    const userSessionId = await resolveUserSession(shopperSession);
    if (userSessionId) return userSessionId;

    // Legacy: UUID-based session
    if (isUuid(shopperSession)) return ensureUuidUser(shopperSession, "shopper");

    // Legacy: customer_sessions plaintext token
    const customerUserId = await resolveCustomerSession(shopperSession);
    if (customerUserId) return customerUserId;
  }

  const creatorSession = cookieStore.get("creator_session")?.value;
  if (process.env.NODE_ENV !== "production" && isUuid(creatorSession)) {
    return ensureUuidUser(creatorSession, "creator");
  }

  const anonSession = cookieStore.get(ANON_SESSION_COOKIE)?.value;
  if (isUuid(anonSession)) return ensureUuidUser(anonSession, "anon");

  return null;
}

export async function getOptionalSocialUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  return resolveExistingSocialUser(cookieStore);
}

export async function getOrCreateSocialUser(): Promise<SocialUserSession> {
  const cookieStore = await cookies();
  const existingUserId = await resolveExistingSocialUser(cookieStore);
  if (existingUserId) return { userId: existingUserId };

  const anonSessionId = crypto.randomUUID();
  const userId = await ensureUuidUser(anonSessionId, "anon");
  return { userId, anonSessionId };
}

export function setAnonSessionCookie(response: Response, anonSessionId?: string): void {
  if (!anonSessionId || !("cookies" in response)) return;

  const nextResponse = response as Response & {
    cookies?: { set: (name: string, value: string, options: Record<string, unknown>) => void };
  };

  nextResponse.cookies?.set(ANON_SESSION_COOKIE, anonSessionId, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    httpOnly: true,
    sameSite: "lax",
  });
}
