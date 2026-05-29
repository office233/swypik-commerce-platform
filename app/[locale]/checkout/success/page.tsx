import { dbQuery } from "@/lib/db";
import Link from "next/link";
import PurchaseTracker from "@/components/PurchaseTracker";
import { getStripe } from "@/lib/stripe/checkout";
import { getOptionalSocialUserId } from "@/lib/social/session";
import crypto from "crypto";
import { getTranslations } from "next-intl/server";

function tokensMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  try {
    return crypto.timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

export const dynamic = "force-dynamic";

type SearchParams = { session_id?: string; payment_intent?: string; order_token?: string };

export default async function CheckoutSuccess({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const t = await getTranslations("success");
  const sp = await searchParams;
  let order: any = null;
  let lookupError = false;
  let paymentConfirmed = false;

  const sessionId = sp.session_id;
  const paymentIntentId = sp.payment_intent;
  const providedToken = typeof sp.order_token === "string" ? sp.order_token : null;
  const authedUserId = await getOptionalSocialUserId().catch(() => null);

  if (sessionId) {
    try {
      const { rows } = await dbQuery(
        `SELECT
           ord.id,
           ord.buyer_user_id,
           cs.provider_session_id AS stripe_session_id,
           ord.metadata->>'customer_email' AS customer_email,
           (ord.total_cents::numeric / 100) AS total_ron,
           ord.metadata->'items' AS items,
           ord.metadata->'shipping_address' AS shipping_address,
           ord.metadata->>'order_lookup_token' AS order_lookup_token,
           ord.status,
           ord.created_at
         FROM commerce_orders ord
         JOIN checkout_sessions cs ON ord.id = cs.order_id
         WHERE cs.provider_session_id = $1
         LIMIT 1`,
        [sessionId]
      );

      if (rows.length > 0) {
        order = rows[0];

        if (order.status === "pending") {
          const stripe = getStripe();
          const session = await stripe.checkout.sessions.retrieve(sessionId, {
            expand: ["payment_intent"],
          });

          if (session.payment_status === "paid") {
            const customerDetails = session.customer_details;
            const shippingAddress = customerDetails?.address
              ? {
                  name: customerDetails.name,
                  phone: customerDetails.phone,
                  line1: customerDetails.address.line1,
                  line2: customerDetails.address.line2,
                  city: customerDetails.address.city,
                  state: customerDetails.address.state,
                  postal_code: customerDetails.address.postal_code,
                  country: customerDetails.address.country,
                }
              : null;

            paymentConfirmed = true;
            order.customer_email = customerDetails?.email || order.customer_email;
            order.shipping_address = shippingAddress || order.shipping_address;
          }
        }
      }
    } catch (error) {
      lookupError = true;
      console.error("[CheckoutSuccess] Error fetching order:", error);
    }
  } else if (paymentIntentId) {
    try {
      const { rows } = await dbQuery(
        `SELECT
           ord.id,
           ord.buyer_user_id,
           ord.metadata->>'stripe_payment_intent' AS stripe_payment_intent,
           ord.metadata->>'customer_email' AS customer_email,
           (ord.total_cents::numeric / 100) AS total_ron,
           ord.metadata->'items' AS items,
           ord.metadata->'shipping_address' AS shipping_address,
           ord.metadata->>'order_lookup_token' AS order_lookup_token,
           ord.status,
           ord.created_at
         FROM commerce_orders ord
         WHERE ord.metadata->>'stripe_payment_intent' = $1
         LIMIT 1`,
        [paymentIntentId]
      );

      if (rows.length > 0) {
        order = rows[0];

        if (order.status === "pending") {
          const stripe = getStripe();
          const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
          if (intent.status === "succeeded") {
            const shipping = intent.shipping;
            const shippingAddress = shipping
              ? {
                  name: shipping.name,
                  phone: shipping.phone,
                  line1: shipping.address?.line1,
                  line2: shipping.address?.line2,
                  city: shipping.address?.city,
                  state: shipping.address?.state,
                  postal_code: shipping.address?.postal_code,
                  country: shipping.address?.country,
                }
              : null;

            paymentConfirmed = true;
            order.customer_email = intent.receipt_email || order.customer_email;
            order.shipping_address = shippingAddress || order.shipping_address;
          }
        }
      }
    } catch (error) {
      lookupError = true;
      console.error("[CheckoutSuccess] Error fetching payment intent order:", error);
    }
  }

  // ── PII gate: only reveal order details if requester proves access ──
  // Allow:
  //  - Stripe session_id branch (the id itself is a one-shot capability scoped to this checkout).
  //  - payment_intent branch only if (a) auth session match buyer_user_id, OR
  //    (b) ?order_token= matches metadata.order_lookup_token via timingSafeEqual.
  let pii_ok = false;
  if (order) {
    if (sessionId) {
      pii_ok = true;
    } else if (paymentIntentId) {
      if (authedUserId && order.buyer_user_id && String(order.buyer_user_id) === String(authedUserId)) {
        pii_ok = true;
      } else if (providedToken && tokensMatch(providedToken, order.order_lookup_token)) {
        pii_ok = true;
      }
    }
  }
  if (order && !pii_ok) {
    // Don't leak PII (email/shipping/items/total). Keep only generic flags so we can render "success".
    order = {
      id: order.id,
      status: order.status,
      created_at: order.created_at,
      customer_email: null,
      shipping_address: null,
      items: null,
      total_ron: null,
      order_lookup_token: null,
      buyer_user_id: null,
    };
  }

  let items = pii_ok && order?.items ? (typeof order.items === "string" ? JSON.parse(order.items) : order.items) : [];
  if (pii_ok && order && items.length === 0) {
    const { rows } = await dbQuery(
      `SELECT title, quantity, (unit_amount_cents::numeric / 100) AS price
       FROM commerce_order_items WHERE order_id = $1 ORDER BY created_at`,
      [order.id]
    );
    items = rows;
  }

  const shipping =
    pii_ok && order?.shipping_address && typeof order.shipping_address === "string"
      ? JSON.parse(order.shipping_address)
      : (pii_ok ? order?.shipping_address : null) || null;

  const hasLookup = Boolean(sessionId || paymentIntentId);
  const isPaid = order?.status === "paid" || paymentConfirmed;
  const isPending = Boolean(order) && !isPaid;

  const title = isPaid
    ? t("headingPaid")
    : isPending
      ? t("headingProcessing")
      : hasLookup
        ? t("headingPending")
        : t("headingMissing");

  const description = isPaid
    ? t("subPaid")
    : isPending
      ? t("subProcessing")
      : hasLookup
        ? lookupError
          ? t("subFetchFailed")
          : t("subPending")
        : t("subMissing");

  const statusBadge = isPaid
    ? { label: t("statusPaid"), classes: "bg-[#0D0D0D]/10 text-[#0D0D0D]" }
    : isPending
      ? { label: t("statusProcessing"), classes: "bg-yellow-100 text-yellow-800" }
      : { label: t("statusVerifying"), classes: "bg-[#F3F4F6] text-[#4B5563]" };

  return (
    <div className="min-h-screen bg-white px-4 py-10">
      {isPaid && pii_ok && order?.id ? <PurchaseTracker orderId={String(order.id)} /> : null}

      <div className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-md items-center">
        <div className="w-full text-center">
          <div
            className={`mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full ${
              isPaid ? "bg-[#0D0D0D]/10" : "bg-yellow-100"
            }`}
          >
            {isPaid ? (
              <svg className="h-10 w-10 text-[#0D0D0D]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="h-10 w-10 text-yellow-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v5m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
          </div>

          <h1 className="text-3xl font-black text-[#0D0D0D]">{title}</h1>
          <p className="mt-3 text-sm font-medium text-[#6E6E80]">{description}</p>

          {(order || hasLookup) && pii_ok && (
            <div className="mt-6 rounded-2xl border border-[#E5E5E5] bg-[#F7F7F8] p-5 text-left">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <span className="text-xs font-bold uppercase tracking-widest text-[#6E6E80]">
                    {order ? `Comanda #${order.id.split("-")[0]}` : "Confirmare checkout"}
                  </span>
                  {order?.created_at && (
                    <p className="mt-1 text-xs text-[#6E6E80]">
                      {new Date(order.created_at).toLocaleDateString("ro-RO", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })}
                    </p>
                  )}
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-bold ${statusBadge.classes}`}>{statusBadge.label}</span>
              </div>

              {order ? (
                <>
                  {items.length > 0 && (
                    <div className="mb-6 space-y-3">
                      {items.map((item: any, idx: number) => (
                        <div key={idx} className="flex justify-between gap-4 text-sm">
                          <span className="line-clamp-1 font-medium text-[#0D0D0D]">
                            {item.quantity}x {item.title}
                          </span>
                          <span className="shrink-0 font-bold text-[#6E6E80]">
                            {Number(item.price * item.quantity).toFixed(2)} lei
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="border-t border-[#E5E5E5] pt-4">
                    <div className="flex items-center justify-between font-black">
                      <span className="text-[#0D0D0D]">{isPaid ? t("totalPaid") : t("totalOrder")}</span>
                      <span className="text-xl text-[#0D0D0D]">{Number(order.total_ron).toFixed(2)} lei</span>
                    </div>
                  </div>

                  {(shipping || order.customer_email) && (
                    <div className="mt-4 border-t border-[#E5E5E5] pt-4 text-sm">
                      {shipping && (
                        <>
                          <p className="mb-1 text-xs font-bold uppercase text-[#6E6E80]">{t("livrareCatre")}</p>
                          <p className="font-medium text-[#0D0D0D]">{shipping.name}</p>
                          <p className="text-[#6E6E80]">
                            {[shipping.line1, shipping.city].filter(Boolean).join(", ")}
                          </p>
                        </>
                      )}
                      {order.customer_email && <p className="mt-2 text-[#6E6E80]">Email: {order.customer_email}</p>}
                    </div>
                  )}

                  {isPaid && <p className="mt-4 text-xs font-medium text-[#6E6E80]">{t("cosulLocalAFost")}</p>}
                </>
              ) : (
                <div className="rounded-xl bg-white px-4 py-3 text-sm text-[#4B5563]">
                  
                  {t("nuAmPututAfisa")}
                </div>
              )}
            </div>
          )}

          <div className="mt-8 space-y-3">
            {order && pii_ok && (
              <Link
                href={`/orders/${encodeURIComponent(sp.order_token || order.order_lookup_token || order.id)}`}
                className="inline-block w-full rounded-xl bg-[#0D0D0D] py-4 text-center text-sm font-bold text-white transition-transform active:scale-[0.98]"
              >
                
                {t("urmaresteComanda")}
              </Link>
            )}
            <Link
              href="/account"
              className="inline-block w-full rounded-xl border border-[#E5E5E5] bg-white py-4 text-center text-sm font-bold text-[#0D0D0D] transition-transform active:scale-[0.98]"
            >
              
              {t("veziContulMeu")}
            </Link>
            <Link
              href="/"
              className="inline-block w-full rounded-xl bg-[#0D0D0D] py-4 text-center text-sm font-bold text-white transition-transform active:scale-[0.98]"
            >
              
              {t("inapoiLaMagazin")}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
