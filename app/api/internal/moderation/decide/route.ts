/**
 * POST /api/internal/moderation/decide — aproba/respinge o cerere.
 *
 * Body: { type: seller|merchant|courier|cause, id, decision: approve|reject,
 *         reason?, erp_api_key? }
 *
 * Pentru seller + approve: ERP-ul trimite erp_api_key generat de el →
 * il salvam pe seller (erp_api_key, erp_connected=true) ca partner API
 * (/api/partner/*) sa functioneze imediat.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { dbQuery } from "@/lib/db";
import { logger } from "@/lib/logger";
import { verifyInternal, forbidden } from "../../_lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const schema = z.object({
    type: z.enum(["seller", "merchant", "courier", "cause"]),
    id: z.string().min(1),
    decision: z.enum(["approve", "reject"]),
    reason: z.string().max(1000).optional(),
    erp_api_key: z.string().min(16).max(128).optional(),
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
    const { type, id, decision, reason, erp_api_key } = parsed.data;
    const approve = decision === "approve";

    try {
        let updated = 0;

        if (type === "seller") {
            if (approve) {
                const { rowCount } = await dbQuery(
                    `UPDATE sellers
                        SET status = 'approved',
                            erp_api_key = COALESCE($2, erp_api_key),
                            erp_connected = CASE WHEN $2 IS NOT NULL THEN true ELSE erp_connected END,
                            updated_at = NOW()
                      WHERE id = $1 AND status = 'pending'`,
                    [id, erp_api_key ?? null]
                );
                updated = rowCount ?? 0;
            } else {
                const { rowCount } = await dbQuery(
                    `UPDATE sellers
                        SET status = 'rejected',
                            metadata = metadata || jsonb_build_object('rejection_reason', $2::text),
                            updated_at = NOW()
                      WHERE id = $1 AND status = 'pending'`,
                    [id, reason ?? ""]
                );
                updated = rowCount ?? 0;
            }
        } else if (type === "merchant") {
            const { rowCount } = await dbQuery(
                `UPDATE local_merchants SET status = $2, updated_at = NOW()
                  WHERE id = $1 AND status = 'pending'`,
                [id, approve ? "active" : "closed"]
            );
            updated = rowCount ?? 0;
        } else if (type === "courier") {
            const { rowCount } = await dbQuery(
                `UPDATE couriers SET verification_status = $2, updated_at = NOW()
                  WHERE id = $1 AND verification_status IN ('pending','in_review')`,
                [id, approve ? "verified" : "rejected"]
            );
            updated = rowCount ?? 0;
        } else if (type === "cause") {
            const { rowCount } = await dbQuery(
                `UPDATE donation_causes SET verification_status = $2, updated_at = NOW()
                  WHERE id = $1 AND verification_status IN ('pending','in_review')`,
                [id, approve ? "verified" : "rejected"]
            );
            updated = rowCount ?? 0;
        }

        if (updated === 0) {
            return NextResponse.json({ error: "not_found_or_already_decided" }, { status: 404 });
        }

        logger.info({ type, id, decision }, "moderation decision applied");
        return NextResponse.json({ ok: true, type, id, decision });
    } catch (e) {
        logger.error({ err: e, type, id }, "moderation decide failed");
        return NextResponse.json({ error: "update_failed" }, { status: 500 });
    }
}
