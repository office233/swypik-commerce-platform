/**
 * POST /api/merchants/apply — aplicație publică de restaurant/comerciant (fără cont de seller).
 *
 * Creează un rând în `local_merchants` cu status='pending' și seller_id NULL.
 * Aplicația apare în coada unificată /admin/aplicatii, unde adminul o aprobă/respinge.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { dbQuery } from "@/lib/db";
import { rateLimit } from "@/lib/security/rate-limit";
import { parseBody } from "@/lib/validation/schemas";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MerchantApplySchema = z.object({
  name: z.string().trim().min(2, "Nume prea scurt").max(160),
  address: z.string().trim().min(5, "Adresă prea scurtă").max(400),
  city: z.string().trim().min(2, "Orașul e obligatoriu").max(120),
  phone: z.string().trim().min(5, "Telefon invalid").max(32),
  email: z.string().trim().email().max(254).optional().or(z.literal("")),
  schedule: z.string().trim().max(400).optional(),
  description: z.string().trim().max(2000).optional(),
});

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
}

export async function POST(req: Request) {
  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const rl = await rateLimit("merchantApply", ip, { limit: 3, window: 3600 });
    if (!rl.success) {
      return NextResponse.json({ success: false, error: "rate_limited" }, { status: 429 });
    }

    const raw = await req.json().catch(() => null);
    const parsed = parseBody(MerchantApplySchema, raw);
    if (!parsed.ok) {
      return NextResponse.json({ success: false, error: parsed.error }, { status: 400 });
    }
    const d = parsed.data;

    // Programul (text liber) se păstrează în descriere până la structurare de către admin.
    const description = [d.description, d.schedule ? `Program: ${d.schedule}` : null]
      .filter(Boolean)
      .join("\n") || null;

    const slug = `${slugify(d.name)}-${Date.now().toString(36).slice(-4)}`;

    const { rows } = await dbQuery(
      `INSERT INTO local_merchants (
         kind, name, slug, description, phone, email, address,
         location_country, location_city, status
       ) VALUES ('restaurant', $1, $2, $3, $4, $5, $6, 'RO', $7, 'pending')
       RETURNING id`,
      [d.name, slug, description, d.phone, d.email || null, d.address, d.city],
    );

    return NextResponse.json({ success: true, id: rows[0]?.id }, { status: 201 });
  } catch (error: unknown) {
    logger.error({ err: error }, "[merchants/apply] POST error");
    return NextResponse.json({ success: false, error: "Eroare la trimiterea aplicației." }, { status: 500 });
  }
}
