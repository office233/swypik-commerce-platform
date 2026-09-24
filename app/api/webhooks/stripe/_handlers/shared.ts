import { dbQuery } from "@/lib/db";
import { sendOrderConfirmation } from "@/lib/email/service";

export async function maybeSendOrderConfirmation(orderId: string) {
  const { rows: orderRows } = await dbQuery(
    `SELECT id, metadata, total_cents
     FROM commerce_orders
     WHERE id = $1
     LIMIT 1`,
    [orderId]
  );
  if (orderRows.length === 0) return;

  const order = orderRows[0];
  const metadata = order.metadata || {};
  const customerEmail = metadata.customer_email;
  if (!customerEmail || metadata.confirmation_email_sent_at) return;

  const { rows: itemRows } = await dbQuery(
    `SELECT title, quantity, (unit_amount_cents::numeric / 100) AS price
     FROM commerce_order_items
     WHERE order_id = $1`,
    [orderId]
  );

  const sent = await sendOrderConfirmation({
    orderId,
    orderLookupToken: metadata.order_lookup_token,
    customerEmail,
    customerName: metadata.shipping_address?.name || "",
    items: (itemRows as Array<{ title: string; quantity: number; price: string }>).map((r) => ({ title: r.title, quantity: r.quantity, price: Number(r.price) })),
    totalRon: Number(order.total_cents || 0) / 100,
    shippingAddress: metadata.shipping_address || undefined,
  });

  if (sent) {
    await dbQuery(
      `UPDATE commerce_orders
       SET metadata = metadata || jsonb_build_object('confirmation_email_sent_at', now()::text)
       WHERE id = $1`,
      [orderId]
    );
  }
}
