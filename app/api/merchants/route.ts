/**
 * Comercianți locali (restaurante, magazine, farmacii) — înregistrare + listare.
 *
 * GET  /api/merchants?city=&kind=&open=1  → listă publică, filtrată pe oraș
 * POST /api/merchants                      → seller își creează comerciantul
 * PATCH /api/merchants                     → actualizare (program, taxe, status)
 */
import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { getSellerSessionId } from "@/lib/security/seller-auth";
import { rateLimit } from "@/lib/security/rate-limit";
import { MerchantCreateSchema, MerchantUpdateSchema, parseBody } from "@/lib/validation/schemas";
import { isOpenNow, hasKnownHours } from "@/lib/merchants/hours";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PUBLIC_COLS = `
  id, kind, name, slug, description, cuisine_types, phone, address,
  location_country, location_city, location_lat, location_lng,
  delivery_radius_km, min_order_cents, delivery_fee_cents, avg_prep_minutes,
  opening_hours, is_open_override, status, rating, image_url, created_at
`;

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const city = url.searchParams.get("city")?.trim() || null;
    const kind = url.searchParams.get("kind")?.trim() || null;
    const cuisine = url.searchParams.get("cuisine")?.trim() || null;
    const onlyOpen = url.searchParams.get("open") === "1";
    const lat = Number(url.searchParams.get("lat"));
    const lng = Number(url.searchParams.get("lng"));
    const hasGeo = Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0;
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 24, 1), 100);
    const page = Math.max(Number(url.searchParams.get("page")) || 1, 1);

    const where: string[] = ["status = 'active'"];
    const params: unknown[] = [];

    if (city) {
      params.push(city);
      where.push(`location_city ILIKE $${params.length}`);
    }
    if (kind && ["restaurant", "grocery", "pharmacy", "flowers", "other"].includes(kind)) {
      params.push(kind);
      where.push(`kind = $${params.length}`);
    }
    if (cuisine) {
      params.push(cuisine);
      where.push(`$${params.length} = ANY(cuisine_types)`);
    }

    // Filtrare geo: doar comercianți în a căror rază de livrare se află clientul.
    // Distanță haversine aproximată (suficientă la <50km).
    let distanceSelect = "NULL::float AS distance_km";
    if (hasGeo) {
      params.push(lat, lng);
      const pLat = `$${params.length - 1}::float`, pLng = `$${params.length}::float`;
      const distExpr = `(6371 * acos(least(1, cos(radians(${pLat})) * cos(radians(location_lat)) * cos(radians(location_lng) - radians(${pLng})) + sin(radians(${pLat})) * sin(radians(location_lat)))))`;
      distanceSelect = `${distExpr} AS distance_km`;
      where.push(`location_lat IS NOT NULL AND location_lng IS NOT NULL AND ${distExpr} <= COALESCE(delivery_radius_km, 5.0)`);
    }

    params.push(limit, (page - 1) * limit);
    const { rows } = await dbQuery(
      `SELECT ${PUBLIC_COLS},
              ${distanceSelect},
              (SELECT count(1) FROM menu_items mi WHERE mi.merchant_id = m.id AND mi.is_available) AS menu_count
         FROM local_merchants m
        WHERE ${where.join(" AND ")}
        ORDER BY ${hasGeo ? "distance_km ASC NULLS LAST," : ""} rating DESC NULLS LAST, created_at DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    // Calculăm "deschis acum" în aplicație (opening_hours e jsonb).
    const merchants = rows.map((m: any) => ({
      ...m,
      is_open: isOpenNow(m.opening_hours, m.is_open_override),
      hours_known: hasKnownHours(m.opening_hours) || m.is_open_override != null,
    }));

    return NextResponse.json({
      success: true,
      merchants: onlyOpen ? merchants.filter((m: any) => m.is_open) : merchants,
      page,
    });
  } catch (error: unknown) {
    logger.error({ err: error }, "[merchants] GET error");
    return NextResponse.json({ success: false, error: "Eroare la încărcarea comercianților." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const sellerId = await getSellerSessionId();
    if (!sellerId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const rl = await rateLimit("sellerProducts", `merchant:${sellerId}`);
    if (!rl.success) {
      return NextResponse.json({ success: false, error: "rate_limited" }, { status: 429 });
    }

    const raw = await req.json().catch(() => null);
    const parsed = parseBody(MerchantCreateSchema, raw);
    if (!parsed.ok) {
      return NextResponse.json({ success: false, error: parsed.error }, { status: 400 });
    }
    const d = parsed.data;

    // Un seller poate avea mai mulți comercianți (lanț), dar slug-ul e unic.
    const slug = `${slugify(d.name)}-${Date.now().toString(36).slice(-4)}`;

    const { rows } = await dbQuery(
      `INSERT INTO local_merchants (
         seller_id, kind, name, slug, description, cuisine_types,
         phone, email, address, location_country, location_city,
         location_lat, location_lng, delivery_radius_km,
         min_order_cents, delivery_fee_cents, avg_prep_minutes,
         opening_hours, image_url, status
       ) VALUES (
         $1, $2, $3, $4, $5, $6,
         $7, $8, $9, $10, $11,
         $12, $13, $14,
         $15, $16, $17,
         $18::jsonb, $19, 'pending'
       )
       RETURNING ${PUBLIC_COLS}`,
      [
        sellerId,
        d.kind,
        d.name,
        slug,
        d.description ?? null,
        d.cuisine_types ?? [],
        d.phone,
        d.email ?? null,
        d.address,
        d.location_country,
        d.location_city,
        d.location_lat ?? null,
        d.location_lng ?? null,
        d.delivery_radius_km ?? 5,
        d.min_order_cents ?? 0,
        d.delivery_fee_cents ?? 0,
        d.avg_prep_minutes ?? 20,
        JSON.stringify(d.opening_hours ?? {}),
        d.image_url ?? null,
      ],
    );

    return NextResponse.json({ success: true, merchant: rows[0] });
  } catch (error: unknown) {
    const e = error as { code?: string };
    if (e?.code === "23505") {
      return NextResponse.json({ success: false, error: "Există deja un comerciant cu acest nume." }, { status: 409 });
    }
    logger.error({ err: error }, "[merchants] POST error");
    return NextResponse.json({ success: false, error: "Eroare la înregistrare." }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const sellerId = await getSellerSessionId();
    if (!sellerId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const raw = await req.json().catch(() => null);
    const parsed = parseBody(MerchantUpdateSchema, raw);
    if (!parsed.ok) {
      return NextResponse.json({ success: false, error: parsed.error }, { status: 400 });
    }
    const { merchant_id, ...d } = parsed.data;

    const sets: string[] = [];
    const params: unknown[] = [merchant_id, sellerId];
    const push = (col: string, val: unknown) => {
      params.push(val);
      sets.push(`${col} = $${params.length}`);
    };

    if (d.name !== undefined) push("name", d.name);
    if (d.description !== undefined) push("description", d.description);
    if (d.cuisine_types !== undefined) push("cuisine_types", d.cuisine_types);
    if (d.phone !== undefined) push("phone", d.phone);
    if (d.address !== undefined) push("address", d.address);
    if (d.location_lat !== undefined) push("location_lat", d.location_lat);
    if (d.location_lng !== undefined) push("location_lng", d.location_lng);
    if (d.delivery_radius_km !== undefined) push("delivery_radius_km", d.delivery_radius_km);
    if (d.min_order_cents !== undefined) push("min_order_cents", d.min_order_cents);
    if (d.delivery_fee_cents !== undefined) push("delivery_fee_cents", d.delivery_fee_cents);
    if (d.avg_prep_minutes !== undefined) push("avg_prep_minutes", d.avg_prep_minutes);
    if (d.image_url !== undefined) push("image_url", d.image_url);
    if (d.is_open_override !== undefined) push("is_open_override", d.is_open_override);
    if (d.opening_hours !== undefined) {
      params.push(JSON.stringify(d.opening_hours));
      sets.push(`opening_hours = $${params.length}::jsonb`);
    }

    if (!sets.length) {
      return NextResponse.json({ success: false, error: "Nimic de actualizat." }, { status: 400 });
    }
    sets.push("updated_at = now()");

    const { rows } = await dbQuery(
      `UPDATE local_merchants SET ${sets.join(", ")}
        WHERE id = $1 AND seller_id = $2
        RETURNING ${PUBLIC_COLS}`,
      params,
    );
    if (!rows.length) {
      return NextResponse.json({ success: false, error: "Comerciantul nu există." }, { status: 404 });
    }
    return NextResponse.json({ success: true, merchant: rows[0] });
  } catch (error: unknown) {
    logger.error({ err: error }, "[merchants] PATCH error");
    return NextResponse.json({ success: false, error: "Eroare la actualizare." }, { status: 500 });
  }
}
