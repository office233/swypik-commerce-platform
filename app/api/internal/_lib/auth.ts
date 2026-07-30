/**
 * Auth pentru API-ul intern (consumat de Multi-ERP).
 * Header `x-internal` comparat timing-safe cu INTERNAL_SECRET.
 */
import crypto from "crypto";

export function verifyInternal(req: Request): boolean {
    const secret = process.env.INTERNAL_SECRET;
    if (!secret) return false;
    const got = req.headers.get("x-internal");
    if (!got || got.length !== secret.length) return false;
    try {
        return crypto.timingSafeEqual(Buffer.from(got), Buffer.from(secret));
    } catch {
        return false;
    }
}

export function forbidden() {
    return Response.json({ error: "forbidden" }, { status: 403 });
}
