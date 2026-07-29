/**
 * Curieri & șoferi — înrolare și profil.
 *
 * POST /api/couriers  → aplicație de înrolare (public, rate-limited).
 * GET  /api/couriers  → profilul curierului logat.
 * PATCH /api/couriers → actualizare profil / documente.
 */
import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { dbQuery } from "@/lib/db";
import { rateLimit } from "@/lib/security/rate-limit";
import { getAuthSession } from "@/lib/auth/session";
import { CourierApplySchema, CourierUpdateSchema, parseBody } from "@/lib/validation/schemas";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function ipHash(req: Request): string {
    const ip =
        req.headers.get("cf-connecting-ip") ||
        req.headers.get("x-real-ip") ||
        req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        "unknown";
    return createHash("sha256").update(ip).digest("hex").slice(0, 32);
}

const PUBLIC_COLS = `
  id, kind, full_name, phone, email, vehicle_type, vehicle_plate,
  city, country, verification_status, is_online, rating,
  completed_deliveries, created_at
`;

export async function POST(req: Request) {
    try {
        const rl = await rateLimit("courierApply", ipHash(req));
        if (!rl.success) {
            return NextResponse.json({ success: false, error: "rate_limited" }, { status: 429 });
        }

        const raw = await req.json().catch(() => null);
        const parsed = parseBody(CourierApplySchema, raw);
        if (!parsed.ok) {
            return NextResponse.json({ success: false, error: parsed.error }, { status: 400 });
        }
        const d = parsed.data;

        const session = await getAuthSession();
        const userId = session?.userId ?? null;

        // Un user poate avea o singură aplicație de curier.
        if (userId) {
            const { rows: existing } = await dbQuery(
                `SELECT id, verification_status FROM couriers WHERE user_id = $1`,
                [userId],
            );
            if (existing.length) {
                return NextResponse.json(
                    { success: false, error: "Ai deja o aplicație de curier.", status: existing[0].verification_status },
                    { status: 409 },
                );
            }
        }

        const { rows } = await dbQuery(
            `INSERT INTO couriers (
         user_id, kind, full_name, phone, email,
         vehicle_type, vehicle_plate, city, country, documents
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
       RETURNING ${PUBLIC_COLS}`,
            [
                userId,
                d.kind,
                d.full_name,
                d.phone,
                d.email ?? null,
                d.vehicle_type,
                d.vehicle_plate ?? null,
                d.city,
                d.country,
                JSON.stringify(d.documents ?? {}),
            ],
        );

        return NextResponse.json({ success: true, courier: rows[0] });
    } catch (error: unknown) {
        logger.error({ err: error }, "[couriers] POST error");
        return NextResponse.json({ success: false, error: "Eroare la înregistrare." }, { status: 500 });
    }
}

export async function GET() {
    try {
        const session = await getAuthSession();
        if (!session?.userId) {
            return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
        }
        const { rows } = await dbQuery(
            `SELECT ${PUBLIC_COLS} FROM couriers WHERE user_id = $1`,
            [session.userId],
        );
        if (!rows.length) {
            return NextResponse.json({ success: true, courier: null });
        }
        return NextResponse.json({ success: true, courier: rows[0] });
    } catch (error: unknown) {
        logger.error({ err: error }, "[couriers] GET error");
        return NextResponse.json({ success: false, error: "Eroare." }, { status: 500 });
    }
}

export async function PATCH(req: Request) {
    try {
        const session = await getAuthSession();
        if (!session?.userId) {
            return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
        }

        const raw = await req.json().catch(() => null);
        const parsed = parseBody(CourierUpdateSchema, raw);
        if (!parsed.ok) {
            return NextResponse.json({ success: false, error: parsed.error }, { status: 400 });
        }
        const d = parsed.data;

        const sets: string[] = [];
        const params: unknown[] = [session.userId];
        const push = (col: string, val: unknown) => {
            params.push(val);
            sets.push(`${col} = $${params.length}`);
        };

        if (d.phone !== undefined) push("phone", d.phone);
        if (d.email !== undefined) push("email", d.email);
        if (d.vehicle_type !== undefined) push("vehicle_type", d.vehicle_type);
        if (d.vehicle_plate !== undefined) push("vehicle_plate", d.vehicle_plate);
        if (d.city !== undefined) push("city", d.city);
        if (d.documents !== undefined) {
            params.push(JSON.stringify(d.documents));
            sets.push(`documents = documents || $${params.length}::jsonb`);
        }
        if (!sets.length) {
            return NextResponse.json({ success: false, error: "Nimic de actualizat." }, { status: 400 });
        }
        sets.push("updated_at = now()");

        const { rows } = await dbQuery(
            `UPDATE couriers SET ${sets.join(", ")} WHERE user_id = $1 RETURNING ${PUBLIC_COLS}`,
            params,
        );
        if (!rows.length) {
            return NextResponse.json({ success: false, error: "Nu ești înregistrat ca curier." }, { status: 404 });
        }
        return NextResponse.json({ success: true, courier: rows[0] });
    } catch (error: unknown) {
        logger.error({ err: error }, "[couriers] PATCH error");
        return NextResponse.json({ success: false, error: "Eroare la actualizare." }, { status: 500 });
    }
}
