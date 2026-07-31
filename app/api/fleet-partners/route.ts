/**
 * Francize de flotă.
 * POST /api/fleet-partners → aplicație publică (rate-limited); notifică admin.
 * GET  /api/fleet-partners → profilul francizei userului logat + șoferii ei.
 */
import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { z } from "zod";
import { dbQuery } from "@/lib/db";
import { rateLimit } from "@/lib/security/rate-limit";
import { getAuthSession } from "@/lib/auth/session";
import { logger } from "@/lib/logger";
import { sendEmail } from "@/lib/email/service";
import { APP_URL } from "@/lib/app-url";

export const dynamic = "force-dynamic";

const FleetPartnerApplySchema = z.object({
    company_name: z.string().trim().min(3).max(160),
    cui: z.string().trim().max(32).optional(),
    contact_name: z.string().trim().min(3).max(120),
    phone: z.string().trim().min(5).max(32),
    email: z.string().trim().email().max(254).optional(),
    city: z.string().trim().min(2).max(80),
    vertical: z.enum(["go", "food", "both"]).default("both"),
});

function ipHash(req: Request): string {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    return createHash("sha256").update(ip).digest("hex").slice(0, 24);
}

export async function POST(req: Request) {
    try {
        const rl = await rateLimit("courierApply", ipHash(req));
        if (!rl.success) return NextResponse.json({ success: false, error: "rate_limited" }, { status: 429 });

        const raw = await req.json().catch(() => null);
        const parsed = FleetPartnerApplySchema.safeParse(raw);
        if (!parsed.success) {
            return NextResponse.json({ success: false, error: "Date invalide" }, { status: 400 });
        }
        const d = parsed.data;

        const session = await getAuthSession();
        const userId = session?.userId ?? null;

        const { rows } = await dbQuery(
            `INSERT INTO fleet_partners (user_id, company_name, cui, contact_name, phone, email, city, vertical)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING id, company_name, city, vertical, status`,
            [userId, d.company_name, d.cui ?? null, d.contact_name, d.phone, d.email ?? null, d.city, d.vertical]
        );

        const opsEmail = process.env.OPS_ALERT_EMAIL || process.env.SUPPORT_EMAIL;
        if (opsEmail) {
            sendEmail({
                to: opsEmail,
                subject: `[Swypik] Aplicație nouă de FRANCIZĂ flotă: ${d.company_name} (${d.city})`,
                html: `<h2>Franciză nouă de flotă</h2>
<p><b>Firmă:</b> ${d.company_name} (CUI: ${d.cui ?? "—"})<br/>
<b>Contact:</b> ${d.contact_name} · ${d.phone} · ${d.email ?? "—"}<br/>
<b>Oraș:</b> ${d.city}<br/>
<b>Vertical:</b> ${d.vertical}</p>
<p><a href="${APP_URL}/admin/fleet">Deschide panoul</a></p>`,
            }).catch((err) => logger.warn({ err }, "[fleet-partners] ops email failed"));
        }

        return NextResponse.json({ success: true, partner: rows[0] });
    } catch (error) {
        logger.error({ err: error }, "[fleet-partners] POST error");
        return NextResponse.json({ success: false, error: "internal_error" }, { status: 500 });
    }
}

export async function GET() {
    try {
        const session = await getAuthSession();
        if (!session?.userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

        const { rows: partners } = await dbQuery(
            `SELECT id, company_name, cui, contact_name, phone, email, city, vertical, status, commission_bps
         FROM fleet_partners WHERE user_id = $1 LIMIT 1`,
            [session.userId]
        );
        if (!partners.length) return NextResponse.json({ partner: null, drivers: [] });
        const partner = partners[0];

        const { rows: drivers } = await dbQuery(
            `SELECT id, kind, full_name, phone, city, vehicle_type, vehicle_plate,
              verification_status, active, created_at
         FROM couriers WHERE fleet_partner_id = $1
        ORDER BY created_at DESC LIMIT 200`,
            [partner.id]
        );

        // Statistici pe flota francizei (best-effort; tabelele pot lipsi in dev).
        let stats = { rides_30d: 0, revenue_30d_cents: 0, commission_30d_cents: 0 };
        try {
            const { rows: statRows } = await dbQuery<{ rides: string; revenue: string }>(
                `SELECT COUNT(*)::int AS rides,
                        COALESCE(SUM(r.total_cents), 0)::bigint AS revenue
                   FROM rides r
                   JOIN couriers c ON c.user_id = r.driver_id
                  WHERE c.fleet_partner_id = $1
                    AND r.status = 'completed'
                    AND r.created_at > now() - interval '30 days'`,
                [partner.id]
            );
            const revenue = Number(statRows[0]?.revenue ?? 0);
            stats = {
                rides_30d: Number(statRows[0]?.rides ?? 0),
                revenue_30d_cents: revenue,
                commission_30d_cents: Math.round((revenue * (partner.commission_bps ?? 0)) / 10000),
            };
        } catch { /* rides table may not exist yet */ }

        return NextResponse.json({ partner, drivers, stats });
    } catch (error) {
        logger.error({ err: error }, "[fleet-partners] GET error");
        return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }
}
