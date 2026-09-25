/**
 * Hook-urile MediaMTX moștenite (`/api/internal/live/{started,ended}`, antet
 * `X-Internal: INTERNAL_SECRET`). Streamurile noi merg pe LiveKit (webhook
 * semnat, /api/live/webhook); acestea rămân pentru streamurile RTMP vechi.
 */
import { timingSafeEqual } from "crypto";

export function verifyInternal(req: Request): boolean {
  const secret = process.env.INTERNAL_SECRET;
  if (!secret) return false;
  const got = req.headers.get("x-internal");
  if (!got || got.length !== secret.length) return false;
  try {
    return timingSafeEqual(Buffer.from(got), Buffer.from(secret));
  } catch {
    return false;
  }
}

/** `live/<key>` sau `live/<key>/...` → key. */
export function extractKey(path: string): string | null {
  const m = path.match(/^live\/([A-Za-z0-9_-]+)/);
  return m ? m[1] : null;
}

/** MediaMTX trimite form-urlencoded (`path=live/<key>`); acceptăm și JSON. */
export async function readStreamKey(req: Request): Promise<string | null> {
  const type = req.headers.get("content-type") || "";
  let path = "";
  if (type.includes("application/json")) {
    const json = (await req.json().catch(() => ({}))) as { path?: unknown };
    path = typeof json.path === "string" ? json.path : "";
  } else {
    const form = await req.formData().catch(() => null);
    const value = form?.get("path");
    path = typeof value === "string" ? value : "";
  }
  return extractKey(path);
}
