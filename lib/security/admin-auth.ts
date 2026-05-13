import { timingSafeEqual, randomBytes, createHash } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { dbQuery } from "@/lib/db";

const COOKIE_NAME = "admin_token";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

function normalizeAdminSecret(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function secureSecretCompare(candidate: string | null | undefined, expected: string | null): boolean {
  if (!candidate || !expected) {
    return false;
  }

  try {
    const candidateBuffer = Buffer.from(candidate);
    const expectedBuffer = Buffer.from(expected);

    if (candidateBuffer.length !== expectedBuffer.length) {
      return false;
    }

    return timingSafeEqual(candidateBuffer, expectedBuffer);
  } catch {
    return false;
  }
}

export function hashAdminSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function getAdminSecret(): string | null {
  return normalizeAdminSecret(process.env.ADMIN_SECRET);
}

export function isAdminConfigured(): boolean {
  return getAdminSecret() !== null;
}

export function isAdminToken(token: string | null | undefined): boolean {
  return secureSecretCompare(token, getAdminSecret());
}

export function getAdminCookieName(): string {
  return COOKIE_NAME;
}

export function readAdminTokenFromCookieHeader(cookieHeader: string | null | undefined): string | null {
  if (!cookieHeader) {
    return null;
  }

  const segments = cookieHeader.split(";").map((segment) => segment.trim());
  for (const segment of segments) {
    const [name, ...valueParts] = segment.split("=");
    if (name === COOKIE_NAME) {
      return valueParts.join("=") || null;
    }
  }

  return null;
}

export async function isAdminRequest(req: Request): Promise<boolean> {
  const configuredSecret = getAdminSecret();
  if (!configuredSecret) {
    return false;
  }

  const authHeader = req.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  // If Bearer token is used and it matches the secret exactly (API usage)
  if (secureSecretCompare(bearerToken, configuredSecret)) {
    return true;
  }

  const cookieToken = readAdminTokenFromCookieHeader(req.headers.get("cookie"));
  if (!cookieToken) return false;

  // Validate session in DB
  const { rows } = await dbQuery(
    `SELECT token FROM admin_sessions WHERE token = $1 AND expires_at > now()`,
    [hashAdminSessionToken(cookieToken)]
  );
  return rows.length > 0;
}

export async function hasAdminSession(): Promise<boolean> {
  if (!isAdminConfigured()) return false;

  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value;
    if (!token) return false;

    const { rows } = await dbQuery(
      `SELECT token FROM admin_sessions WHERE token = $1 AND expires_at > now()`,
      [hashAdminSessionToken(token)]
    );
    return rows.length > 0;
  } catch {
    return false;
  }
}

export async function requireAdminSession(redirectTo = "/admin"): Promise<void> {
  if (!(await hasAdminSession())) {
    redirect(redirectTo);
  }
}

export async function assertAdminSession(): Promise<void> {
  if (!(await hasAdminSession())) {
    throw new Error("Unauthorized");
  }
}

export async function createAdminSessionAndGetCookie(): Promise<string> {
  const secret = getAdminSecret();
  if (!secret) {
    throw new Error("ADMIN_SECRET is not configured.");
  }

  const token = randomBytes(32).toString("hex");
  await dbQuery(
    `INSERT INTO admin_sessions (token, created_at, expires_at) VALUES ($1, now(), now() + interval '7 days')`,
    [hashAdminSessionToken(token)]
  );

  const isProd = process.env.NODE_ENV === "production";
  const secureFlag = isProd ? "; Secure" : "";
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${COOKIE_MAX_AGE}${secureFlag}`;
}

export function getClearAdminCookieHeader(): string {
  const isProd = process.env.NODE_ENV === "production";
  const secureFlag = isProd ? "; Secure" : "";
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secureFlag}`;
}
