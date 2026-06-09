/**
 * Cloudflare Turnstile server-side verification.
 *
 * In production, TURNSTILE_SECRET_KEY MUST be set. In development, if the
 * secret is missing, verification is skipped (with a warning) so local dev
 * isn't broken.
 */
import { logger } from "@/lib/logger";

export async function verifyTurnstile(
  token: string | undefined,
  ip: string,
): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("TURNSTILE_SECRET_KEY missing in production");
    }
    logger.warn("[turnstile] secret not set — skipping verification (dev only)");
    return true;
  }
  if (!token) return false;
  try {
    const res = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          secret,
          response: token,
          remoteip: ip,
        }),
      },
    );
    const data = (await res.json()) as { success: boolean };
    return data.success === true;
  } catch (e) {
    logger.error({ err: e }, "[turnstile] verification request failed");
    return false;
  }
}
