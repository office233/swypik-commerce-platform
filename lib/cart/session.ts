/**
 * Cart session helper — resolves the active cart for a request.
 *
 * Logic:
 *  - If user is authed (swypik_session cookie), use carts.user_id.
 *  - Else, use cookie 'swypik_cart_token' which maps to carts.external_cart_id.
 *  - Creates an active cart row if none exists.
 */
import { cookies } from "next/headers";
import crypto from "crypto";
import { dbQuery } from "@/lib/db";
import { getAuthUser } from "@/lib/auth/getAuthUser";

export const CART_COOKIE = "swypik_cart_token";
const CART_TOKEN_MAX_AGE = 60 * 60 * 24 * 30;
const isProd = process.env.NODE_ENV === "production";

export type ActiveCart = {
  cartId: string;
  userId: string | null;
  anonToken: string | null;
  currency: string;
};

export async function getOrCreateCart(opts: { create?: boolean } = {}): Promise<ActiveCart | null> {
  const auth = await getAuthUser().catch(() => null);
  const userId = auth?.userId ?? null;
  const store = await cookies();
  const anonToken = store.get(CART_COOKIE)?.value || null;

  if (userId) {
    const { rows } = await dbQuery<{ id: string; currency: string }>(
      `SELECT id, currency FROM carts WHERE user_id = $1 AND status = 'active' ORDER BY created_at DESC LIMIT 1`,
      [userId],
    );
    if (rows[0]) return { cartId: rows[0].id, userId, anonToken, currency: rows[0].currency };
    if (!opts.create) return null;
    const ins = await dbQuery<{ id: string; currency: string }>(
      `INSERT INTO carts (user_id, status, currency) VALUES ($1, 'active', 'RON') RETURNING id, currency`,
      [userId],
    );
    return { cartId: ins.rows[0].id, userId, anonToken, currency: ins.rows[0].currency };
  }

  if (anonToken) {
    const { rows } = await dbQuery<{ id: string; currency: string }>(
      `SELECT id, currency FROM carts WHERE external_cart_id = $1 AND status = 'active' LIMIT 1`,
      [anonToken],
    );
    if (rows[0]) return { cartId: rows[0].id, userId: null, anonToken, currency: rows[0].currency };
  }

  if (!opts.create) return null;
  const newToken = anonToken || crypto.randomBytes(24).toString("hex");
  const ins = await dbQuery<{ id: string; currency: string }>(
    `INSERT INTO carts (external_cart_id, status, currency) VALUES ($1, 'active', 'RON')
     ON CONFLICT (external_cart_id) DO UPDATE SET updated_at = now()
     RETURNING id, currency`,
    [newToken],
  );
  return { cartId: ins.rows[0].id, userId: null, anonToken: newToken, currency: ins.rows[0].currency };
}

export function buildCartCookie(token: string): string {
  return `${CART_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${CART_TOKEN_MAX_AGE}${isProd ? "; Secure" : ""}`;
}

export async function loadCartItems(cartId: string) {
  const { rows } = await dbQuery<{
    id: string;
    external_product_id: string;
    external_variant_id: string | null;
    title: string;
    quantity: number;
    currency: string;
    unit_amount_cents: number;
    metadata: any;
    mp_title: string | null;
    mp_price_cents: number | null;
    mp_currency: string | null;
    mp_image: string | null;
  }>(
    `SELECT ci.id, ci.external_product_id, ci.external_variant_id, ci.title, ci.quantity,
            ci.currency, ci.unit_amount_cents, ci.metadata,
            mp.title AS mp_title, mp.price_cents AS mp_price_cents,
            mp.currency AS mp_currency, mp.image_url AS mp_image
     FROM cart_items ci
     LEFT JOIN marketplace_products mp
       ON mp.id::text = ci.external_product_id OR mp.external_product_id = ci.external_product_id
     WHERE ci.cart_id = $1 ORDER BY ci.created_at`,
    [cartId],
  );
  return rows.map((r) => {
    const title = r.title && r.title !== 'Produs' ? r.title : (r.mp_title || r.title || 'Produs');
    const priceCents = r.unit_amount_cents && r.unit_amount_cents > 0 ? r.unit_amount_cents : (r.mp_price_cents || 0);
    const currency = (r.currency || r.mp_currency || 'RON').toUpperCase();
    const image = r.metadata?.image ?? r.mp_image ?? null;
    return {
      id: r.id,
      productId: r.external_product_id,
      variantId: r.external_variant_id,
      title,
      image,
      quantity: r.quantity,
      priceCents,
      currency,
      metadata: r.metadata ?? {},
    };
  });
}

/** Move all rows of anonCart into userCart, then delete anonCart. */
export async function mergeAnonCartToUser(anonToken: string, userId: string): Promise<void> {
  if (!anonToken || !userId) return;
  const { rows: anonRows } = await dbQuery<{ id: string }>(
    `SELECT id FROM carts WHERE external_cart_id = $1 AND status = 'active' LIMIT 1`,
    [anonToken],
  );
  if (!anonRows[0]) return;
  const anonCartId = anonRows[0].id;

  let userCartId: string;
  const { rows: userRows } = await dbQuery<{ id: string }>(
    `SELECT id FROM carts WHERE user_id = $1 AND status = 'active' ORDER BY created_at DESC LIMIT 1`,
    [userId],
  );
  if (userRows[0]) {
    userCartId = userRows[0].id;
  } else {
    const ins = await dbQuery<{ id: string }>(
      `INSERT INTO carts (user_id, status, currency) VALUES ($1, 'active', 'RON') RETURNING id`,
      [userId],
    );
    userCartId = ins.rows[0].id;
  }

  // Move items; on unique conflict (same external_product+variant w/ mergeable=true), sum quantities.
  const { rows: items } = await dbQuery<any>(
    `SELECT id, external_product_id, external_variant_id, title, quantity, currency, unit_amount_cents, metadata
     FROM cart_items WHERE cart_id = $1`,
    [anonCartId],
  );
  for (const it of items) {
    const mergeable = it.metadata?.mergeable === true;
    if (mergeable) {
      const { rowCount } = await dbQuery(
        `UPDATE cart_items SET quantity = LEAST(quantity + $1, 99), updated_at = now()
         WHERE cart_id = $2 AND external_product_id = $3
           AND COALESCE(external_variant_id,'') = COALESCE($4,'')
           AND (metadata->>'mergeable') = 'true'`,
        [it.quantity, userCartId, it.external_product_id, it.external_variant_id],
      );
      if (rowCount && rowCount > 0) {
        await dbQuery(`DELETE FROM cart_items WHERE id = $1`, [it.id]);
        continue;
      }
    }
    await dbQuery(`UPDATE cart_items SET cart_id = $1 WHERE id = $2`, [userCartId, it.id]);
  }
  await dbQuery(`DELETE FROM carts WHERE id = $1`, [anonCartId]);
}
