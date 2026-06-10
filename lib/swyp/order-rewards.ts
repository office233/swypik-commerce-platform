/**
 * Order-driven SWYP awards.
 *
 * On `paid`/`fulfilled` orders:
 *   - 5% of total_cents → creator who published the source video.
 *   - 1% of total_cents → buyer (cashback).
 *
 * Idempotent via awardSwyp metadata.order_id + type tag.
 *
 * Source video resolution:
 *   1. shares.video_id via commerce_orders.source_share_id
 *   2. commerce_orders.metadata.source_video_id (fallback if FE supplies it)
 */

import { dbQuery } from "@/lib/db";
import { awardSwyp } from "./award";
import { notifyUser } from "@/lib/notifications/dispatch";

export async function awardOrderSwyp(orderId: string): Promise<void> {
  if (!orderId) return;
  const { rows } = await dbQuery<{
    id: string;
    status: string;
    buyer_user_id: string | null;
    total_cents: number;
    source_share_id: string | null;
    metadata: { source_video_id?: string } | null;
  }>(
    `SELECT id, status, buyer_user_id, total_cents, source_share_id, metadata
       FROM commerce_orders WHERE id = $1 LIMIT 1`,
    [orderId],
  );
  const order = rows[0];
  if (!order) return;
  if (!["paid", "fulfilled"].includes(order.status)) return;
  const total = Number(order.total_cents || 0);
  if (total <= 0) return;

  // Resolve source video → creator.
  let creatorId: string | null = null;
  let videoId: string | null = (order.metadata?.source_video_id as string) || null;
  if (order.source_share_id) {
    const { rows: srows } = await dbQuery<{ video_id: string; creator_id: string }>(
      `SELECT s.video_id, v.creator_id
         FROM shares s
         JOIN videos v ON v.id = s.video_id
        WHERE s.id = $1 LIMIT 1`,
      [order.source_share_id],
    );
    if (srows[0]) {
      videoId = srows[0].video_id;
      creatorId = srows[0].creator_id;
    }
  }
  if (!creatorId && videoId) {
    const { rows: vrows } = await dbQuery<{ creator_id: string }>(
      `SELECT creator_id FROM videos WHERE id = $1 LIMIT 1`,
      [videoId],
    );
    creatorId = vrows[0]?.creator_id || null;
  }

  // Creator commission (5%).
  if (creatorId && creatorId !== order.buyer_user_id) {
    const amount = Math.floor(total * 0.05);
    if (amount > 0) {
      const res = await awardSwyp(creatorId, amount, "creator_commission", {
        order_id: order.id,
        type: "creator_commission",
        video_id: videoId,
        source_type: "order",
        source_id: order.id,
      });
      if (res.awarded) {
        await notifyUser(creatorId, {
          type: "commission",
          targetType: videoId ? "video" : null,
          targetId: videoId,
          payload: {
            title: "Comision nou",
            body: `Cineva a cumpărat prin clipul tău — +${amount} SWYP comision`,
            url: "/wallet",
            kind: "swyp_creator_commission",
            amount,
            order_id: order.id,
          },
        }).catch(() => {});
      }
    }
  }

  // Buyer cashback (1%).
  if (order.buyer_user_id) {
    const amount = Math.floor(total * 0.01);
    if (amount > 0) {
      const res = await awardSwyp(order.buyer_user_id, amount, "buyer_cashback", {
        order_id: order.id,
        type: "buyer_cashback",
        source_type: "order",
        source_id: order.id,
      });
      if (res.awarded) {
        await notifyUser(order.buyer_user_id, {
          type: "system",
          payload: {
            title: "Cashback SWYP",
            body: `Mulțumim pentru comandă — +${amount} SWYP cashback`,
            url: "/wallet",
            kind: "swyp_buyer_cashback",
            amount,
            order_id: order.id,
          },
        }).catch(() => {});
      }
    }
  }
}
