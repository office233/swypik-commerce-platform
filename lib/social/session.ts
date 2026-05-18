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

// ---------- HMAC-signed anon cookie (UUID.hmac) ----------

function getAnonSigningKey(): string {
  const key = process.env.APP_ENCRYPTION_KEY || process.env.NEXTAUTH_SECRET || "";
  if (!key) {
    // Last-resort dev fallback. Production MUST set APP_ENCRYPTION_KEY.
    return "swypik-dev-anon-fallback-key";
  }
  return key;
}

function anonHmac(uuid: string): string {
  return crypto
    .createHmac("sha256", getAnonSigningKey())
    .update(uuid)
    .digest("hex")
    .slice(0, 32); // 16 bytes hex
}

export function signAnonValue(uuid: string): string {
  return `${uuid}.${anonHmac(uuid)}`;
}

/**
 * Parse anon cookie. Returns the UUID iff the HMAC is valid.
 * Legacy plain-UUID cookies are rejected to prevent impersonation.
 */
function parseSignedAnon(value: string | undefined | null): string | null {
  if (!value) return null;
  const dot = value.indexOf(".");
  if (dot < 0) {
    // Legacy plain UUID — REJECT (security: no impersonation).
    return null;
  }
  const uuid = value.slice(0, dot);
  const mac = value.slice(dot + 1);
  if (!isUuid(uuid) || mac.length !== 32) return null;
  const expected = anonHmac(uuid);
  try {
    const a = Buffer.from(mac, "hex");
    const b = Buffer.from(expected, "hex");
    if (a.length !== b.length) return null;
    if (!crypto.timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  return uuid;
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

/**
 * Verify that a UUID corresponds to a real anon user (no password set, role=shopper).
 * Used for backward-compat with legacy plain-UUID swypik_session cookies — we now
 * require the DB row to be a true anon shell, otherwise an attacker could
 * impersonate any user by guessing/leaking their UUID.
 */
async function isAnonUser(userId: string): Promise<boolean> {
  try {
    const { rows } = await dbQuery<{ id: string }>(
      `SELECT id FROM users
       WHERE id = $1
         AND password_hash IS NULL
         AND email IS NULL
         AND (metadata->>'source') IN ('anon_session','shopper_session')
       LIMIT 1`,
      [userId],
    );
    return rows.length > 0;
  } catch {
    return false;
  }
}

async function resolveExistingSocialUser(cookieStore: CookieStore): Promise<string | null> {
  const shopperSession = cookieStore.get("swypik_session")?.value;
  if (shopperSession) {
    // 1) New hashed-token user_sessions (canonical authenticated path)
    const userSessionId = await resolveUserSession(shopperSession);
    if (userSessionId) return userSessionId;

    // 3) Legacy plain-UUID cookie: ONLY accept if the DB row is a real anon shell.
    //    Otherwise refuse — forces re-login and blocks UUID impersonation.
    if (isUuid(shopperSession) && (await isAnonUser(shopperSession))) {
      return ensureUuidUser(shopperSession, "shopper");
    }
  }

  const creatorSession = cookieStore.get("creator_session")?.value;
  if (process.env.NODE_ENV !== "production" && isUuid(creatorSession)) {
    return ensureUuidUser(creatorSession, "creator");
  }

  const rawAnon = cookieStore.get(ANON_SESSION_COOKIE)?.value;
  const verifiedAnon = parseSignedAnon(rawAnon);
  if (verifiedAnon) return ensureUuidUser(verifiedAnon, "anon");

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

  // Store signed value: <uuid>.<hmac> — prevents impersonation if cookie is leaked/guessed.
  nextResponse.cookies?.set(ANON_SESSION_COOKIE, signAnonValue(anonSessionId), {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    httpOnly: true,
    sameSite: "lax",
  });
}
