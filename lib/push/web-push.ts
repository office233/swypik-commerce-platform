/**
 * Web Push wrapper around the `web-push` npm package.
 *
 * Reads VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT from env.
 * sendPushToUser fans out to all of a user's subscriptions and
 * removes dead ones (HTTP 410 Gone / 404 Not Found).
 */

// @ts-expect-error - web-push doesn't ship types by default
import webpush from "web-push";
import { dbQuery } from "@/lib/db";

let configured = false;

function ensureConfigured() {
  if (configured) return;

  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:admin@swypik.com";

  if (!publicKey || !privateKey) {
    throw new Error("VAPID keys missing — set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY");
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
}

export type PushPayload = {
  title: string;
  body?: string;
  url?: string;
  icon?: string;
  badge?: string;
  tag?: string;
  [key: string]: unknown;
};

type SubscriptionRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  try {
    ensureConfigured();
  } catch (err) {
    console.warn("[push] VAPID not configured, skipping push:", (err as Error).message);
    return;
  }

  const { rows } = await dbQuery<SubscriptionRow>(
    `SELECT id, endpoint, p256dh, auth
       FROM push_subscriptions
      WHERE user_id = $1`,
    [userId],
  );

  if (rows.length === 0) return;

  const body = JSON.stringify(payload);

  await Promise.all(
    rows.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          body,
        );
        // Track last used; ignore errors here
        dbQuery(
          `UPDATE push_subscriptions SET last_used_at = NOW() WHERE id = $1`,
          [sub.id],
        ).catch(() => {});
      } catch (err: any) {
        const status = err?.statusCode;
        if (status === 410 || status === 404) {
          // Subscription is dead — purge it
          await dbQuery(
            `DELETE FROM push_subscriptions WHERE id = $1`,
            [sub.id],
          ).catch(() => {});
        } else {
          console.warn("[push] send failed", { endpoint: sub.endpoint, status, err: err?.message });
        }
      }
    }),
  );
}

export function getVapidPublicKey(): string {
  return process.env.VAPID_PUBLIC_KEY || "";
}
