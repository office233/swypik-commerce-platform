import { notFound } from "next/navigation";
import { dbQuery } from "@/lib/db";
import LiveViewerClient from "./LiveViewerClient";

export const dynamic = "force-dynamic";

export default async function LiveViewerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { rows } = await dbQuery(
    `SELECT ls.id, ls.title, ls.description, ls.status, ls.hls_url, ls.viewer_count,
            ls.creator_id, u.username, u.display_name, u.avatar_url
       FROM live_streams ls
       LEFT JOIN users u ON u.id::text = ls.creator_id
      WHERE ls.id = $1 LIMIT 1`,
    [id],
  );
  if (!rows[0]) notFound();
  const { rows: items } = await dbQuery(
    `SELECT lsi.id, lsi.product_id, lsi.is_pinned, lsi.flash_price_cents, lsi.flash_until,
            p.title, p.image_url, p.price_cents, p.currency
       FROM live_shop_items lsi
       LEFT JOIN marketplace_products p ON p.id::text = lsi.product_id
      WHERE lsi.stream_id = $1
      ORDER BY lsi.is_pinned DESC, lsi.display_order ASC`,
    [id],
  );
  return <LiveViewerClient stream={rows[0] as any} items={items as any} />;
}
