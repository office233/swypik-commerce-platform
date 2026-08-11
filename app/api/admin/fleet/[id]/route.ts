/**
 * PATCH /api/admin/fleet/[id] — verificarea aplicațiilor de flotă.
 * Body: { action: "approve" | "reject" | "suspend", fleet_partner_id? }
 * La approve: verification_status='approved', active=true; opțional leagă de franciză.
 */
import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { isAdminRequest } from "@/lib/security/admin-auth";
import { UUID_RE } from "@/lib/validation/uuid";
import { logger } from "@/lib/logger";
import { sendEmail } from "@/lib/email/service";
import { assignTierOnApproval, getTierParams, TIER_COMMISSION_PCT } from "@/lib/drivers/tiers";
import { getOrCreateDriverCode } from "@/lib/drivers/referral";
import { APP_URL } from "@/lib/app-url";

export const dynamic = "force-dynamic";

export async function PATCH(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        if (!(await isAdminRequest(req))) {
            return NextResponse.json({ error: "unauthorized" }, { status: 401 });
        }
        const { id } = await params;
        if (!UUID_RE.test(id)) return NextResponse.json({ error: "invalid_id" }, { status: 400 });

        const body = await req.json().catch(() => ({}));
        const action = String(body?.action ?? "");
        const fleetPartnerId =
            typeof body?.fleet_partner_id === "string" && UUID_RE.test(body.fleet_partner_id)
                ? body.fleet_partner_id
                : null;

        let sql: string;
        if (action === "approve") {
            sql = `UPDATE couriers
                      SET verification_status='approved', active=true,
                          fleet_partner_id=COALESCE($2, fleet_partner_id), updated_at=now()
                    WHERE id=$1
                RETURNING id, kind, full_name, email, verification_status`;
        } else if (action === "reject") {
            sql = `UPDATE couriers
                      SET verification_status='rejected', active=false, updated_at=now()
                    WHERE id=$1
                RETURNING id, kind, full_name, email, verification_status`;
        } else if (action === "suspend") {
            sql = `UPDATE couriers
                      SET active=false, updated_at=now()
                    WHERE id=$1
                RETURNING id, kind, full_name, email, verification_status`;
        } else if (action === "reactivate") {
            sql = `UPDATE couriers
                      SET active=true, updated_at=now()
                    WHERE id=$1 AND verification_status='approved'
                RETURNING id, kind, full_name, email, verification_status`;
        } else if (action === "delete") {
            sql = `DELETE FROM couriers WHERE id=$1
                RETURNING id, kind, full_name, email, verification_status`;
        } else {
            return NextResponse.json({ error: "invalid_action" }, { status: 400 });
        }

        const { rows } = await dbQuery(sql, action === "approve" ? [id, fleetPartnerId] : [id]);
        if (!rows.length) return NextResponse.json({ error: "not_found" }, { status: 404 });
        const courier = rows[0];

        // La aprobare: atribuie treapta de comision (Founding Drivers) si codul
        // de referral. Best-effort — o eroare aici nu trebuie sa blocheze aprobarea.
        let tier: string | null = null;
        let referralCode: string | null = null;
        if (action === "approve") {
            try {
                const assigned = await assignTierOnApproval(id);
                tier = assigned.tier;
            } catch (err) {
                logger.error({ err, courierId: id }, "[admin/fleet] assignTierOnApproval failed");
            }
            try {
                referralCode = await getOrCreateDriverCode(id);
            } catch (err) {
                logger.error({ err, courierId: id }, "[admin/fleet] getOrCreateDriverCode failed");
            }
        }

        // Anunta aplicantul pe email (best-effort).
        if (courier.email && (action === "approve" || action === "reject")) {
            const kindLabel = courier.kind === "driver" ? "șofer Swypik Go" : "curier Swypik Food";
            const tierPct = tier ? TIER_COMMISSION_PCT[tier as keyof typeof TIER_COMMISSION_PCT] : null;
            const { promoDays } = await getTierParams();
            const tierHtml =
                tierPct !== null
                    ? `<p><strong>Comisionul tău: 0% în primele ${promoDays} de zile</strong>, apoi ${tierPct}% pe viață${tier === "founding15" ? " (Founding Driver — primii 500)" : ""
                    }.</p>`
                    : "";
            const codeHtml = referralCode
                ? `<p>Codul tău de invitație pentru clienți: <strong>${referralCode}</strong> — clienții noi primesc prima cursă la jumătate de preț, iar tu primești bonus.</p>`
                : "";
            sendEmail({
                to: courier.email,
                subject:
                    action === "approve"
                        ? `Felicitări! Contul tău de ${kindLabel} a fost aprobat`
                        : `Aplicația ta de ${kindLabel} a fost respinsă`,
                html:
                    action === "approve"
                        ? `<h2>Bine ai venit în flota Swypik, ${courier.full_name}!</h2><p>Contul tău a fost verificat și aprobat. Intră în panou: <a href="${APP_URL}/courier">swypik.com/courier</a></p>${tierHtml}${codeHtml}`
                        : `<h2>Salut, ${courier.full_name}</h2><p>Din păcate aplicația ta nu a fost aprobată momentan. Ne poți contacta pentru detalii.</p>`,
            }).catch((err) => logger.warn({ err }, "[admin/fleet] applicant email failed"));
        }

        return NextResponse.json({ success: true, courier, tier, referral_code: referralCode });
    } catch (error) {
        logger.error({ err: error }, "[admin/fleet] PATCH error");
        return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }
}
