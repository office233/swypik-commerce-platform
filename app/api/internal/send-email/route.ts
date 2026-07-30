/**
 * POST /api/internal/send-email — trimitere email transactional pentru ERP.
 *
 * Multi-ERP nu are propriul furnizor de email: refoloseste Resend-ul deja
 * configurat aici (o singura cheie, un singur domeniu verificat, un singur loc
 * unde se schimba furnizorul). Autentificare: header x-internal.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { sendMail } from "@/lib/email/transport";
import { logger } from "@/lib/logger";
import { verifyInternal, forbidden } from "../_lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const schema = z.object({
    to: z.string().email(),
    subject: z.string().min(1).max(300),
    html: z.string().min(1).max(100_000),
    text: z.string().max(50_000).optional(),
    replyTo: z.string().email().optional(),
});

export async function POST(req: Request) {
    if (!verifyInternal(req)) return forbidden();

    let body: unknown;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: "invalid_json" }, { status: 400 });
    }
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json({ error: "validation", details: parsed.error.flatten() }, { status: 400 });
    }

    const { to, subject, html, text, replyTo } = parsed.data;
    try {
        const ok = await sendMail({ to, subject, html, text, replyTo });
        if (!ok) {
            return NextResponse.json({ error: "send_failed" }, { status: 502 });
        }
        logger.info({ to: to.replace(/(.{2}).*@/, "$1***@"), subject }, "internal email sent");
        return NextResponse.json({ ok: true });
    } catch (e) {
        logger.error({ err: e }, "internal send-email failed");
        return NextResponse.json({ error: "send_failed" }, { status: 502 });
    }
}
