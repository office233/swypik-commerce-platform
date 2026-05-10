/**
 * Checkout Success Page — shows order confirmation after Stripe payment
 */

import { dbQuery } from "@/lib/db";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function CheckoutSuccess({
  searchParams,
}: {
  searchParams: { session_id?: string };
}) {
  let order: any = null;

  if (searchParams.session_id) {
    try {
      const { rows } = await dbQuery(
        `SELECT id, stripe_session_id, customer_email, total_ron, items, 
                shipping_address, status, created_at
         FROM orders WHERE stripe_session_id = $1 LIMIT 1`,
        [searchParams.session_id]
      );
      if (rows.length > 0) order = rows[0];
    } catch (e) {
      console.error("[CheckoutSuccess] Error fetching order:", e);
    }
  }

  const items = order?.items ? (typeof order.items === "string" ? JSON.parse(order.items) : order.items) : [];
  const shipping = order?.shipping_address ? (typeof order.shipping_address === "string" ? JSON.parse(order.shipping_address) : order.shipping_address) : null;

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-4">
      <div className="w-full max-w-md text-center">
        {/* Success Icon */}
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-[#10A37F]/10">
          <svg className="h-10 w-10 text-[#10A37F]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>

        <h1 className="text-3xl font-black text-[#0D0D0D]">
          Mulțumim pentru comandă! 🎉
        </h1>
        <p className="mt-3 text-sm font-medium text-[#6E6E80]">
          Plata a fost procesată cu succes. Vei primi un email de confirmare.
        </p>

        {order && (
          <div className="mt-6 rounded-2xl bg-[#F7F7F8] border border-[#E5E5E5] p-5 text-left">
            <div className="flex justify-between items-center mb-4">
              <span className="text-xs font-bold uppercase tracking-widest text-[#6E6E80]">
                Comanda #{order.id}
              </span>
              <span className="rounded-full bg-[#10A37F]/10 px-3 py-1 text-xs font-bold text-[#10A37F]">
                ✅ Plătit
              </span>
            </div>

            {/* Items */}
            <div className="space-y-2 mb-4">
              {items.map((item: any, i: number) => (
                <div key={i} className="flex justify-between text-sm">
                  <span className="font-medium text-[#0D0D0D] truncate flex-1 mr-2">
                    {item.quantity > 1 ? `${item.quantity}x ` : ""}{item.name}
                  </span>
                  <span className="font-bold text-[#0D0D0D] shrink-0">
                    {item.price} lei
                  </span>
                </div>
              ))}
            </div>

            {/* Total */}
            <div className="border-t border-[#E5E5E5] pt-3 flex justify-between">
              <span className="text-sm font-bold text-[#6E6E80]">Total</span>
              <span className="text-xl font-black text-[#10A37F]">
                {order.total_ron} lei
              </span>
            </div>

            {/* Shipping */}
            {shipping && (
              <div className="mt-4 border-t border-[#E5E5E5] pt-3">
                <p className="text-xs font-bold uppercase tracking-widest text-[#6E6E80] mb-1">
                  Livrare la
                </p>
                <p className="text-sm font-medium text-[#0D0D0D]">
                  {shipping.name}
                </p>
                <p className="text-sm text-[#6E6E80]">
                  {[shipping.line1, shipping.line2, shipping.city, shipping.state, shipping.postal_code, shipping.country].filter(Boolean).join(", ")}
                </p>
              </div>
            )}

            {order.customer_email && (
              <p className="mt-3 text-xs text-[#6E6E80]">
                📧 Confirmare trimisă la {order.customer_email}
              </p>
            )}
          </div>
        )}

        {!order && searchParams.session_id && (
          <div className="mt-6 rounded-2xl bg-[#FEF3C7] border border-[#F59E0B]/30 p-4">
            <p className="text-sm font-medium text-[#92400E]">
              ⏳ Comanda se procesează. Revino în câteva secunde sau verifică email-ul.
            </p>
          </div>
        )}

        <div className="mt-8 space-y-3">
          <Link
            href="/"
            className="block w-full rounded-xl bg-[#0D0D0D] py-4 text-center text-sm font-bold text-white active:scale-[0.98] transition-transform"
          >
            ← Înapoi la magazin
          </Link>
          <p className="text-xs text-[#A1A1AA]">
            🚚 Vei fi notificat când comanda este expediată
          </p>
        </div>
      </div>
    </div>
  );
}
