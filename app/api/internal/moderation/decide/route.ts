/**
 * POST /api/internal/moderation/decide — aproba/respinge o cerere.
 *
 * Body: { type: seller|merchant|courier|cause|developer|video, id, decision: approve|reject,
 *         reason?, erp_api_key? }
 *
 * Pentru seller + approve: ERP-ul trimite erp_api_key generat de el →
 * il salvam pe seller (erp_api_key_hash + erp_api_key_enc, erp_connected=true) ca partner API
 * (/api/partner/*) sa functioneze imediat.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { dbQuery } from "@/lib/db";
import { logger } from "@/lib/logger";
import { encryptErpKey, hashErpKey } from "@/lib/seller/erp-credentials";
import { verifyInternal, forbidden } from "../../_lib/auth";
import { afterVideoDecision, decideVideo } from "@/lib/admin/moderation/video-decision";
import { logAdminAction } from "@/lib/security/admin-audit";
import { isUuidParam } from "@/lib/validation/params";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const schema = z.object({
    type: z.enum(["seller", "merchant", "courier", "cause", "developer", "video"]),
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
                            erp_api_key = CASE WHEN $2::text IS NOT NULL THEN NULL ELSE erp_api_key END,
                            erp_api_key_hash = COALESCE($2, erp_api_key_hash),
                            erp_api_key_enc = COALESCE($3, erp_api_key_enc),
                            erp_connected = CASE WHEN $2 IS NOT NULL THEN true ELSE erp_connected END,
                            updated_at = NOW()
                      WHERE id = $1 AND status = 'pending'`,
                    // Cheia de partner: doar hash + criptată (niciodată în clar).
                    [id, erp_api_key ? hashErpKey(erp_api_key) : null, erp_api_key ? encryptErpKey(erp_api_key) : null]
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
        } else if (type === "developer") {
            const { rowCount } = await dbQuery(
                `UPDATE developer_accounts SET status = $2, updated_at = NOW()
                                    WHERE id = $1 AND status = 'pending'`,
                [id, approve ? "approved" : "rejected"]
            );
            updated = rowCount ?? 0;
        } else if (type === "video") {
            // Aceeași regulă ca în consola de admin (lib/admin/moderation/video-decision.ts).
            if (isUuidParam(id)) {
                const result = await decideVideo({ videoId: id, decision, reason: reason ?? null, actorUserId: null });
                if (result.ok) {
                    updated = 1;
                    await afterVideoDecision(result, decision);
                }
            }
        }

        if (updated === 0) {
            return NextResponse.json({ error: "not_found_or_already_decided" }, { status: 404 });
        }

        // Deciziile din Multi-ERP intră în același jurnal de audit ca cele din consolă.
        await logAdminAction({
            action: `${type}.${approve ? "approve" : "reject"}`,
            targetType: type,
            targetId: id,
            details: { source: "erp", reason: reason ?? null },
            actorKind: "erp",
            req,
        });
        logger.info({ type, id, decision }, "moderation decision applied");
        return NextResponse.json({ ok: true, type, id, decision });
    } catch (e) {
        logger.error({ err: e, type, id }, "moderation decide failed");
        return NextResponse.json({ error: "update_failed" }, { status: 500 });
    }
}
