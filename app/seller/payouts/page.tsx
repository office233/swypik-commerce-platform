import { redirect } from "next/navigation";
import { getSellerSessionId } from "@/lib/security/seller-auth";
import { dbQuery } from "@/lib/db";
import PayoutsClient from "./PayoutsClient";

export const dynamic = "force-dynamic";

type SellerRow = {
  id: string;
  name: string | null;
  email: string;
  status: string;
  stripe_account_id: string | null;
};

type SummaryRow = {
  available_cents: string;
  pending_cents: string;
  paid_90_cents: string;
};

type TransferRow = {
  id: string;
  status: string;
  currency: string;
  amount_cents: number;
  provider_transfer_id: string | null;
  created_at: string;
  completed_at: string | null;
};

export default async function SellerPayoutsPage() {
  const sellerId = await getSellerSessionId();
  if (!sellerId) redirect("/seller/login");

  const { rows: sellerRows } = await dbQuery<SellerRow>(
    `SELECT id::text, name, email, status, stripe_account_id
       FROM sellers WHERE id = $1 LIMIT 1`,
    [sellerId],
  );
  const seller = sellerRows[0];
  if (!seller) redirect("/seller/login");

  // Available + pending sums via marketplace_products seller_id join.
  // "Available" = paid/fulfilled/delivered orders not yet flagged plătit.
  // We use commerce_order_items.payout_status to split.
  const { rows: sumRows } = await dbQuery<SummaryRow>(
    `SELECT
        COALESCE(SUM(CASE
          WHEN co.status IN ('paid','fulfilled','delivered')
           AND COALESCE(coi.payout_status,'pending') IN ('pending','available')
          THEN coi.gross_amount_cents ELSE 0 END), 0)::text AS available_cents,
        COALESCE(SUM(CASE
          WHEN co.status IN ('paid','fulfilled','delivered')
           AND coi.payout_status = 'in_transit'
          THEN coi.gross_amount_cents ELSE 0 END), 0)::text AS pending_cents,
        COALESCE(SUM(CASE
          WHEN coi.payout_status = 'paid'
           AND coi.updated_at > now() - interval '90 days'
          THEN coi.gross_amount_cents ELSE 0 END), 0)::text AS paid_90_cents
       FROM commerce_order_items coi
       JOIN marketplace_products mp ON mp.id = coi.product_id
       JOIN commerce_orders co ON co.id = coi.order_id
      WHERE mp.seller_id = $1`,
    [sellerId],
  ).catch(() => ({ rows: [{ available_cents: "0", pending_cents: "0", paid_90_cents: "0" } as SummaryRow] }));

  const summary = sumRows[0] || { available_cents: "0", pending_cents: "0", paid_90_cents: "0" };

  // Transferuri: connect_transfers e legat de creator_connect_accounts. Sellers încă
  // nu au tabel propriu — listăm gol dacă nu există. (Forward compat: dacă viitor
  // sellers vor avea connect_account_id în metadata, completăm aici.)
  const { rows: transferRows } = await dbQuery<TransferRow>(
    `SELECT ct.id::text, ct.status, ct.currency, ct.amount_cents,
            ct.provider_transfer_id, ct.created_at, ct.completed_at
       FROM connect_transfers ct
      WHERE ct.metadata ->> 'seller_id' = $1
      ORDER BY ct.created_at DESC
      LIMIT 20`,
    [sellerId],
  ).catch(() => ({ rows: [] as TransferRow[] }));

  // Estimare următor payout: 15 a lunii curente sau a lunii viitoare.
  const now = new Date();
  const nextPayout = new Date(now.getFullYear(), now.getMonth(), 15);
  if (nextPayout <= now) nextPayout.setMonth(nextPayout.getMonth() + 1);

  return (
    <PayoutsClient
      seller={{
        id: seller.id,
        name: seller.name,
        email: seller.email,
        hasStripe: Boolean(seller.stripe_account_id),
        stripeAccountId: seller.stripe_account_id,
      }}
      summary={{
        availableCents: Number(summary.available_cents) || 0,
        pendingCents: Number(summary.pending_cents) || 0,
        paid90Cents: Number(summary.paid_90_cents) || 0,
        currency: "RON",
      }}
      transfers={transferRows}
      nextPayoutIso={nextPayout.toISOString()}
    />
  );
}
