/**
 * PATCH /api/admin/fleet-partners/[id] — administrarea francizelor de flotă.
 * Body: { action: "approve" | "reject" | "suspend" | "reactivate" | "delete", commission_bps? }
 */
import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { isAdminRequest } from "@/lib/security/admin-auth";
import { UUID_RE } from "@/lib/validation/uuid";
import { logger } from "@/lib/logger";
import { sendEmail } from "@/lib/email/service";
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
        const commissionBps = Number.isFinite(Number(body?.commission_bps))
            ? Math.max(0, Math.min(5000, Number(body.commission_bps)))
            : null;

        let sql: string;
        let args: unknown[] = [id];
        if (action === "approve") {
            sql = `UPDATE fleet_partners
                      SET status='active', commission_bps=COALESCE($2, commission_bps), updated_at=now()
                    WHERE id=$1 RETURNING id, company_name, email, status`;
            args = [id, commissionBps];
        } else if (action === "reject") {
            sql = `UPDATE fleet_partners SET status='rejected', updated_at=now()
                    WHERE id=$1 RETURNING id, company_name, email, status`;
        } else if (action === "suspend") {
            sql = `UPDATE fleet_partners SET status='suspended', updated_at=now()
                    WHERE id=$1 RETURNING id, company_name, email, status`;
        } else if (action === "reactivate") {
            sql = `UPDATE fleet_partners SET status='active', updated_at=now()
                    WHERE id=$1 RETURNING id, company_name, email, status`;
        } else if (action === "delete") {
            sql = `DELETE FROM fleet_partners WHERE id=$1
                RETURNING id, company_name, email, status`;
        } else {
            return NextResponse.json({ error: "invalid_action" }, { status: 400 });
        }

        const { rows } = await dbQuery(sql, args);
        if (!rows.length) return NextResponse.json({ error: "not_found" }, { status: 404 });
        const partner = rows[0];

        if (partner.email && (action === "approve" || action === "reject")) {
            sendEmail({
                to: partner.email,
                subject:
                    action === "approve"
                        ? `Franciza ${partner.company_name} a fost aprobată`
                        : `Aplicația de franciză ${partner.company_name} a fost respinsă`,
                html:
                    action === "approve"
                        ? `<h2>Bine ai venit în rețeaua Swypik!</h2><p>Franciza ta a fost aprobată. Intră în panou: <a href="${APP_URL}/fleet">swypik.com/fleet</a></p>`
                        : `<h2>Salut</h2><p>Din păcate aplicația de franciză nu a fost aprobată momentan. Ne poți contacta pentru detalii.</p>`,
            }).catch((err) => logger.warn({ err }, "[admin/fleet-partners] email failed"));
        }

        return NextResponse.json({ success: true, partner });
    } catch (error) {
        logger.error({ err: error }, "[admin/fleet-partners] PATCH error");
        return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }
}
