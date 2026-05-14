import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { cookies } from "next/headers";
import { ArrowLeft } from "lucide-react";
import { getAuthUser } from "@/lib/auth/getAuthUser";
import { dbQuery } from "@/lib/db";
import { formatCurrency } from "@/lib/i18n/currency";
import { CURRENCY_COOKIE, isCurrency, DEFAULT_CURRENCY, type Currency } from "@/lib/i18n/config";
import OrderReturnButton from "./OrderReturnButton";

export const dynamic = "force-dynamic";

type OrderRow = {
  id: string;
  status: string;
  subtotal_cents: number;
  shipping_cents: number;
  tax_cents: number;
  discount_cents: number;
  total_cents: number;
  currency: string;
  created_at: string;
  metadata: Record<string, unknown>;
};

type ItemRow = {
  id: string;
  title: string;
  quantity: number;
  unit_amount_cents: number;
  gross_amount_cents: number;
  currency: string;
};

const STATUS_LABELS: Record<string, string> = {
  pending: "În așteptare",
  paid: "Plătită",
  processing: "În procesare",
  fulfilled: "Expediată",
  delivered: "Livrată",
  cancelled: "Anulată",
  refunded: "Rambursată",
  return_requested: "Retur solicitat",
};

const RETURNABLE_STATUSES = new Set(["delivered", "fulfilled"]);

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getAuthUser();
  if (!user.userId) redirect(`/account?redirect=/account/orders/${id}`);

  const cookieStore = await cookies();
  const cookieCurrency = cookieStore.get(CURRENCY_COOKIE)?.value;
  const displayCurrency: Currency =
    cookieCurrency && isCurrency(cookieCurrency) ? cookieCurrency : DEFAULT_CURRENCY;

  const { rows } = await dbQuery<OrderRow>(
    `SELECT id, status, subtotal_cents, shipping_cents, tax_cents, discount_cents,
            total_cents, currency, created_at, metadata
       FROM commerce_orders
      WHERE id = $1 AND buyer_user_id = $2
      LIMIT 1`,
    [id, user.userId],
  );
  const order = rows[0];
  if (!order) notFound();

  const { rows: items } = await dbQuery<ItemRow>(
    `SELECT id, title, quantity, unit_amount_cents, gross_amount_cents, currency
       FROM commerce_order_items
      WHERE order_id = $1
      ORDER BY created_at ASC`,
    [id],
  );

  const src = (order.currency?.trim() as Currency) || "RON";
  const fmt = (c: number) =>
    formatCurrency(c, { sourceCurrency: src, displayCurrency, locale: "ro" });

  const lookupToken = (order.metadata?.order_lookup_token as string | undefined) || null;
  const canReturn = RETURNABLE_STATUSES.has(order.status);

  return (
    <main className="min-h-screen bg-black text-white pb-24">
      <header className="sticky top-0 z-10 flex items-center gap-3 px-4 py-3 bg-black/80 backdrop-blur border-b border-white/10">
        <Link href="/account/orders" className="p-1 -ml-1">
          <ArrowLeft size={22} />
        </Link>
        <h1 className="text-lg font-black">Comandă #{order.id.slice(0, 8)}</h1>
      </header>

      <div className="px-4 pt-4 max-w-2xl mx-auto space-y-4">
        <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-white/50">Status</span>
            <span className="text-sm font-bold">{STATUS_LABELS[order.status] || order.status}</span>
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs text-white/50">Dată</span>
            <span className="text-sm">
              {new Date(order.created_at).toLocaleString("ro-RO")}
            </span>
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/[0.04] divide-y divide-white/5 overflow-hidden">
          {items.map((it) => (
            <div key={it.id} className="px-4 py-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold line-clamp-2">{it.title}</div>
                <div className="text-xs text-white/50">
                  Cant: {it.quantity} × {fmt(it.unit_amount_cents)}
                </div>
              </div>
              <div className="text-sm font-bold">{fmt(it.gross_amount_cents)}</div>
            </div>
          ))}
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 space-y-1.5 text-sm">
          <div className="flex justify-between text-white/70">
            <span>Subtotal</span>
            <span>{fmt(order.subtotal_cents)}</span>
          </div>
          {order.discount_cents > 0 && (
            <div className="flex justify-between text-green-400">
              <span>Reducere</span>
              <span>−{fmt(order.discount_cents)}</span>
            </div>
          )}
          <div className="flex justify-between text-white/70">
            <span>Transport</span>
            <span>{fmt(order.shipping_cents)}</span>
          </div>
          {order.tax_cents > 0 && (
            <div className="flex justify-between text-white/70">
              <span>TVA</span>
              <span>{fmt(order.tax_cents)}</span>
            </div>
          )}
          <div className="flex justify-between text-base font-bold pt-2 border-t border-white/10 mt-2">
            <span>Total</span>
            <span>{fmt(order.total_cents)}</span>
          </div>
        </section>

        {canReturn && lookupToken && (
          <OrderReturnButton orderId={order.id} lookupToken={lookupToken} />
        )}
        {canReturn && !lookupToken && (
          <p className="text-xs text-white/40 text-center">
            Pentru retur, contactează suportul (token comandă lipsă).
          </p>
        )}
      </div>
    </main>
  );
}
