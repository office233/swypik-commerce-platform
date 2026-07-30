/**
 * Meniul unui comerciant.
 *
 * GET   /api/merchants/[id]/menu   → public: categorii + articole disponibile
 * POST  /api/merchants/[id]/menu   → seller adaugă articol sau categorie
 * PATCH /api/merchants/[id]/menu   → seller actualizează articol
 * DELETE /api/merchants/[id]/menu?item_id=  → șterge articol
 */
import { NextResponse } from "next/server";
import { dbQuery, withTransaction } from "@/lib/db";
import { getSellerSessionId } from "@/lib/security/seller-auth";
import {
  MenuCategoryCreateSchema,
  MenuItemCreateSchema,
  MenuItemUpdateSchema,
  parseBody,
} from "@/lib/validation/schemas";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Verifică dacă sellerul logat deține comerciantul. */
async function ownsMerchant(merchantId: string, sellerId: string): Promise<boolean> {
  const { rows } = await dbQuery(
    `SELECT 1 FROM local_merchants WHERE id = $1 AND seller_id = $2`,
    [merchantId, sellerId],
  );
  return rows.length > 0;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const { rows: merchants } = await dbQuery(
      `SELECT id, name, status FROM local_merchants WHERE id = $1 OR slug = $1`,
      [id],
    );
    const merchant = merchants[0];
    if (!merchant || merchant.status !== "active") {
      return NextResponse.json({ success: false, error: "Comerciantul nu există." }, { status: 404 });
    }

    const [{ rows: categories }, { rows: items }] = await Promise.all([
      dbQuery(
        `SELECT id, name, sort_order FROM menu_categories
          WHERE merchant_id = $1 AND is_active ORDER BY sort_order, name`,
        [merchant.id],
      ),
      dbQuery(
        `SELECT id, category_id, name, description, price_cents, currency,
                image_url, options, allergens, sort_order
           FROM menu_items
          WHERE merchant_id = $1 AND is_available
          ORDER BY sort_order, name`,
        [merchant.id],
      ),
    ]);

    // Grupăm articolele pe categorii; cele fără categorie merg în „Altele”.
    const byCat = new Map<string | null, unknown[]>();
    for (const it of items as any[]) {
      const k = it.category_id ?? null;
      if (!byCat.has(k)) byCat.set(k, []);
      byCat.get(k)!.push(it);
    }

    const menu = (categories as any[]).map((c) => ({
      id: c.id,
      name: c.name,
      items: byCat.get(c.id) ?? [],
    }));
    const uncategorised = byCat.get(null) ?? [];
    if (uncategorised.length) {
      menu.push({ id: null, name: "Altele", items: uncategorised });
    }

    return NextResponse.json({
      success: true,
      merchant: { id: merchant.id, name: merchant.name },
      menu: menu.filter((c) => c.items.length > 0),
    });
  } catch (error: unknown) {
    logger.error({ err: error }, "[menu] GET error");
    return NextResponse.json({ success: false, error: "Eroare la încărcarea meniului." }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const sellerId = await getSellerSessionId();
    if (!sellerId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    if (!(await ownsMerchant(id, sellerId))) {
      return NextResponse.json({ success: false, error: "Nu e comerciantul tău." }, { status: 403 });
    }

    const raw = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const body = { ...(raw ?? {}), merchant_id: id };

    // Categorie sau articol? Diferențiem după prezența prețului.
    if (raw && raw.price === undefined && raw.type === "category") {
      const parsed = parseBody(MenuCategoryCreateSchema, body);
      if (!parsed.ok) {
        return NextResponse.json({ success: false, error: parsed.error }, { status: 400 });
      }
      const { rows } = await dbQuery(
        `INSERT INTO menu_categories (merchant_id, name, sort_order)
         VALUES ($1, $2, $3) RETURNING id, name, sort_order`,
        [id, parsed.data.name, parsed.data.sort_order ?? 100],
      );
      return NextResponse.json({ success: true, category: rows[0] });
    }

    const parsed = parseBody(MenuItemCreateSchema, body);
    if (!parsed.ok) {
      return NextResponse.json({ success: false, error: parsed.error }, { status: 400 });
    }
    const d = parsed.data;

    // Categoria (dacă e dată) trebuie să aparțină aceluiași comerciant.
    if (d.category_id) {
      const { rows: cat } = await dbQuery(
        `SELECT 1 FROM menu_categories WHERE id = $1 AND merchant_id = $2`,
        [d.category_id, id],
      );
      if (!cat.length) {
        return NextResponse.json({ success: false, error: "Categorie invalidă." }, { status: 400 });
      }
    }

    const { rows } = await dbQuery(
      `INSERT INTO menu_items (
         merchant_id, category_id, name, description, price_cents, currency,
         image_url, options, allergens, sort_order
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10)
       RETURNING id, category_id, name, description, price_cents, currency,
                 image_url, options, allergens, is_available, sort_order`,
      [
        id,
        d.category_id ?? null,
        d.name,
        d.description ?? null,
        Math.round(d.price * 100),
        d.currency,
        d.image_url ?? null,
        JSON.stringify(d.options ?? []),
        d.allergens ?? [],
        d.sort_order ?? 100,
      ],
    );

    return NextResponse.json({ success: true, item: rows[0] });
  } catch (error: unknown) {
    logger.error({ err: error }, "[menu] POST error");
    return NextResponse.json({ success: false, error: "Eroare la salvare." }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const sellerId = await getSellerSessionId();
    if (!sellerId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    if (!(await ownsMerchant(id, sellerId))) {
      return NextResponse.json({ success: false, error: "Nu e comerciantul tău." }, { status: 403 });
    }

    const raw = await req.json().catch(() => null);
    const parsed = parseBody(MenuItemUpdateSchema, raw);
    if (!parsed.ok) {
      return NextResponse.json({ success: false, error: parsed.error }, { status: 400 });
    }
    const { item_id, ...d } = parsed.data;

    const sets: string[] = [];
    const p: unknown[] = [item_id, id];
    const push = (col: string, val: unknown) => {
      p.push(val);
      sets.push(`${col} = $${p.length}`);
    };

    if (d.name !== undefined) push("name", d.name);
    if (d.description !== undefined) push("description", d.description);
    if (d.price !== undefined) push("price_cents", Math.round(d.price * 100));
    if (d.image_url !== undefined) push("image_url", d.image_url);
    if (d.allergens !== undefined) push("allergens", d.allergens);
    if (d.is_available !== undefined) push("is_available", d.is_available);
    if (d.sort_order !== undefined) push("sort_order", d.sort_order);
    if (d.options !== undefined) {
      p.push(JSON.stringify(d.options));
      sets.push(`options = $${p.length}::jsonb`);
    }

    if (!sets.length) {
      return NextResponse.json({ success: false, error: "Nimic de actualizat." }, { status: 400 });
    }

    const { rows } = await dbQuery(
      `UPDATE menu_items SET ${sets.join(", ")}
        WHERE id = $1 AND merchant_id = $2
        RETURNING id, name, price_cents, is_available`,
      p,
    );
    if (!rows.length) {
      return NextResponse.json({ success: false, error: "Articolul nu există." }, { status: 404 });
    }
    return NextResponse.json({ success: true, item: rows[0] });
  } catch (error: unknown) {
    logger.error({ err: error }, "[menu] PATCH error");
    return NextResponse.json({ success: false, error: "Eroare la actualizare." }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const sellerId = await getSellerSessionId();
    if (!sellerId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    if (!(await ownsMerchant(id, sellerId))) {
      return NextResponse.json({ success: false, error: "Nu e comerciantul tău." }, { status: 403 });
    }

    const url = new URL(req.url);
    const itemId = url.searchParams.get("item_id");
    const categoryId = url.searchParams.get("category_id");

    if (itemId) {
      const { rowCount } = await dbQuery(
        `DELETE FROM menu_items WHERE id = $1 AND merchant_id = $2`,
        [itemId, id],
      );
      return NextResponse.json({ success: rowCount > 0 });
    }
    if (categoryId) {
      // Articolele rămân, dar fără categorie (ON DELETE SET NULL în schemă).
      const { rowCount } = await withTransaction(async (q) =>
        q(`DELETE FROM menu_categories WHERE id = $1 AND merchant_id = $2`, [categoryId, id]),
      );
      return NextResponse.json({ success: rowCount > 0 });
    }
    return NextResponse.json({ success: false, error: "item_id sau category_id lipsă." }, { status: 400 });
  } catch (error: unknown) {
    logger.error({ err: error }, "[menu] DELETE error");
    return NextResponse.json({ success: false, error: "Eroare la ștergere." }, { status: 500 });
  }
}
