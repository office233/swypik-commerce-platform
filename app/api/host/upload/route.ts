/**
 * POST /api/host/upload — upload poză pentru o cazare (multipart/form-data).
 * Doar gazde aprobate. Validarea tipului/semnăturii e în lib/storage/upload.
 * Returnează URL-ul public, folosit apoi la crearea/editarea listingului.
 */
import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { getAuthSession } from "@/lib/auth/session";
import { rateLimit, getClientIP } from "@/lib/security/rate-limit";
import { uploadFile } from "@/lib/storage/upload";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
    const session = await getAuthSession().catch(() => null);
    if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const rl = await rateLimit("host:upload", getClientIP(req), { limit: 30, window: 3600 });
    if (!rl.success) return NextResponse.json({ error: "Prea multe încărcări." }, { status: 429 });

    const approved = await dbQuery(
        `SELECT 1 FROM host_applications WHERE user_id = $1 AND status = 'approved' LIMIT 1`,
        [session.userId],
    );
    if (!approved.rows.length) {
        return NextResponse.json({ error: "Doar gazdele aprobate pot încărca poze." }, { status: 403 });
    }

    let file: File | null = null;
    try {
        const form = await req.formData();
        const f = form.get("file");
        if (f instanceof File) file = f;
    } catch {
        return NextResponse.json({ error: "Formular invalid." }, { status: 400 });
    }
    if (!file) return NextResponse.json({ error: "Lipsește fișierul." }, { status: 400 });

    try {
        const buf = Buffer.from(await file.arrayBuffer());
        const result = await uploadFile(buf, file.name || "poza.jpg", file.type, {
            keyPrefix: `stays/${session.userId}`,
        });
        logger.info({ user: session.userId, size: result.size }, "host photo uploaded");
        return NextResponse.json({ ok: true, url: result.url });
    } catch (err: any) {
        logger.warn({ err }, "host upload failed");
        return NextResponse.json({ error: err?.message ?? "Încărcare eșuată." }, { status: 400 });
    }
}
