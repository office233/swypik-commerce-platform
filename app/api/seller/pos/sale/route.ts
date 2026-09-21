import { NextResponse } from "next/server";
import { z } from "zod";
import { withTransaction } from "@/lib/db";
import { getSellerSessionId } from "@/lib/security/seller-auth";
import { rateLimit } from "@/lib/security/rate-limit";
import { parseBody } from "@/lib/validation/schemas";
import { withErrorHandling } from "@/lib/api-handler";
import { nextSellerSequence } from "@/lib/seller/sequences";
import { formatReceiptNumber, toCents } from "@/lib/seller/invoicing";

export const dynamic = "force-dynamic";

const SaleLineSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().max(200).optional(),
  quantity: z.coerce.number().int().min(1).max(10_000),
  /** Pret unitar cu TVA, in RON. */
  price: z.coerce.number().min(0).max(1_000_000),
});

const PosSaleSchema = z.object({
  items: z.array(SaleLineSchema).min(1, "Cosul POS este gol."),
  paymentMethod: z.enum(["cash", "card"]),
});

class ProductNotOwnedError extends Error {
  constructor(public readonly productId: string) {
    super("product_not_owned");
  }
}

/**
 * Vanzare la casa: scade stocul SI persista bonul, in aceeasi tranzactie.
 * Versiunea anterioara doar scadea stocul (fara tranzactie) si inventa un
 * numar de bon din timestamp - vanzarea nu exista nicaieri dupa raspuns.
 */
export const POST = withErrorHandling(async function POST(req: Request) {
  const sellerId = await getSellerSessionId();
  if (!sellerId) {
    return NextResponse.json({ success: false, error: "unauthorized" }, { status: 401 });
  }
  const rl = await rateLimit("sellerPos", sellerId);
  if (!rl.success) {
    return NextResponse.json({ success: false, error: "rate_limited" }, { status: 429 });
  }

  const parsed = parseBody(PosSaleSchema, await req.json().catch(() => null));
  if (!parsed.ok) {
    return NextResponse.json({ success: false, error: parsed.error }, { status: 400 });
  }
  const { items, paymentMethod } = parsed.data;
  const totalCents = items.reduce((sum, i) => sum + toCents(i.price) * i.quantity, 0);

  let sale: { id: string; receipt_number: string; created_at: string };
  try {
    sale = await withTransaction(async (q) => {
      for (const item of items) {
        const { rowCount } = await q(
          `UPDATE marketplace_products
              SET metadata = jsonb_set(
                    metadata, '{available_stock}',
                    to_jsonb(GREATEST(0, COALESCE((metadata->>'available_stock')::numeric, 0) - $1))),
                  inventory_status = CASE
                    WHEN GREATEST(0, COALESCE((metadata->>'available_stock')::numeric, 0) - $1) <= 0
                    THEN 'out_of_stock' ELSE 'in_stock' END,
                  updated_at = now()
            WHERE id = $2 AND seller_id = $3`,
          [item.quantity, item.id, sellerId],
        );
        if (rowCount === 0) throw new ProductNotOwnedError(item.id);
      }

      const now = new Date();
      const seq = await nextSellerSequence(q, sellerId, "pos_receipt", now.toISOString().slice(0, 10));
      const { rows } = await q<{ id: string; receipt_number: string; created_at: string }>(
        `INSERT INTO seller_pos_sales (seller_id, receipt_number, items, total_cents, payment_method)
         VALUES ($1, $2, $3::jsonb, $4, $5)
         RETURNING id, receipt_number, created_at`,
        [sellerId, formatReceiptNumber(now, seq), JSON.stringify(items), totalCents, paymentMethod],
      );
      return rows[0];
    });
  } catch (err) {
    if (err instanceof ProductNotOwnedError) {
      return NextResponse.json({ success: false, error: "product_not_found", productId: err.productId }, { status: 404 });
    }
    throw err;
  }

  return NextResponse.json(
    { success: true, receiptNumber: sale.receipt_number, date: sale.created_at, totalCents, paymentMethod },
    { status: 201 },
  );
});
