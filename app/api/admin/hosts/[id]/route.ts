/**
 * POST /api/admin/hosts/[id] — acțiuni pe aplicațiile de gazdă.
 * Body: { action: "approve" | "reject" | "needs_info", note?: string }
 *
 * approve → status approved (publicarea listing-ului e pas separat, după
 *           ce gazda își completează calendarul și pozele).
 * reject / needs_info → cer motiv (audit).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { dbQuery } from "@/lib/db";
import { hasAdminSession, isAdminToken } from "@/lib/security/admin-auth";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function isAdmin(req: Request): Promise<boolean> {
    const bearer = req.headers.get("authorization");
    if (bearer?.startsWith("Bearer ") && isAdminToken(bearer.slice(7))) return true;
    return hasAdminSession();
}

const schema = z.object({
    action: z.enum(["approve", "reject", "needs_info"]),
    note: z.string().max(1000).optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
    if (!(await isAdmin(req))) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
        return NextResponse.json({ error: "Date invalide" }, { status: 400 });
    }
    const { action, note } = parsed.data;

    if ((action === "reject" || action === "needs_info") && !note?.trim()) {
        return NextResponse.json({ error: "Motivul e obligatoriu pentru respingere sau cerere de informații." }, { status: 400 });
    }

    const status = action === "approve" ? "approved" : action === "reject" ? "rejected" : "needs_info";
    const { rows } = await dbQuery<{ id: string; email: string; property_name: string }>(
        `UPDATE host_applications
            SET status = $1, admin_notes = COALESCE($2, admin_notes),
                reviewed_by = 'admin', reviewed_at = NOW(), updated_at = NOW()
          WHERE id = $3 AND status IN ('pending','needs_info')
          RETURNING id, email, property_name`,
        [status, note?.trim() || null, id],
    );
    if (!rows.length) {
        return NextResponse.json({ error: "Aplicația nu există sau a fost deja procesată." }, { status: 404 });
    }

    logger.info({ applicationId: id, action }, "host application reviewed");
    return NextResponse.json({ ok: true, status });
}
