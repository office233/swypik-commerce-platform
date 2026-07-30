/**
 * Webhooks către aplicațiile terțe instalate.
 *
 * dispatchAppWebhook(event, sellerId, payload) — fire-and-forget:
 *  - găsește apps published + instalate de seller, cu webhook_url setat
 *    și scope potrivit evenimentului;
 *  - trimite POST semnat HMAC-SHA256 cu secretul app-ului
 *    (header X-Swypik-Signature: sha256=<hex>);
 *  - loghează rezultatul în app_webhook_deliveries.
 *
 * NB: secretul de semnare este oauth_client_secret_hash (derivat, niciodată
 * secretul în clar — acesta nu mai există în DB). Dezvoltatorii verifică
 * semnătura cu sha256(client_secret) drept cheie, documentat în README.
 */
import crypto from "crypto";
import { dbQuery } from "@/lib/db";
import { logger } from "@/lib/logger";
import type { AppScope } from "./scopes";

export type AppWebhookEvent = "order.created" | "product.updated";

const EVENT_SCOPE: Record<AppWebhookEvent, AppScope> = {
  "order.created": "read_orders",
  "product.updated": "read_products",
};

interface TargetApp {
  app_id: string;
  install_id: string;
  webhook_url: string;
  secret_hash: string;
}

async function deliver(target: TargetApp, event: AppWebhookEvent, body: string): Promise<void> {
  const signature = crypto
    .createHmac("sha256", target.secret_hash)
    .update(body)
    .digest("hex");

  let statusCode: number | null = null;
  let error: string | null = null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(target.webhook_url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Swypik-Event": event,
        "X-Swypik-Signature": `sha256=${signature}`,
      },
      body,
      signal: controller.signal,
    });
    clearTimeout(timer);
    statusCode = res.status;
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  await dbQuery(
    `INSERT INTO app_webhook_deliveries (app_id, install_id, event, status_code, error)
     VALUES ($1, $2, $3, $4, $5)`,
    [target.app_id, target.install_id, event, statusCode, error],
  ).catch((e) => logger.error({ err: e }, "[app-webhooks] delivery log failed"));

  if (error || (statusCode !== null && statusCode >= 400)) {
    logger.warn({ app_id: target.app_id, event, statusCode, error }, "[app-webhooks] delivery failed");
  }
}

/**
 * Fire-and-forget: NU await-ui rezultatul în fluxul principal.
 * Apelează `void dispatchAppWebhook(...)`.
 */
export async function dispatchAppWebhook(
  event: AppWebhookEvent,
  sellerId: string | null,
  payload: Record<string, unknown>,
): Promise<void> {
  if (!sellerId) return;
  try {
    const scope = EVENT_SCOPE[event];
    const { rows } = await dbQuery<TargetApp>(
      `SELECT a.id AS app_id, i.id AS install_id, a.webhook_url,
              a.oauth_client_secret_hash AS secret_hash
         FROM app_installs i
         JOIN apps a ON a.id = i.app_id
        WHERE i.seller_id = $1
          AND i.revoked_at IS NULL
          AND a.status = 'published'
          AND a.webhook_url IS NOT NULL
          AND a.webhook_url <> ''
          AND $2 = ANY(i.granted_scopes)`,
      [sellerId, scope],
    );
    if (rows.length === 0) return;

    const body = JSON.stringify({
      event,
      seller_id: sellerId,
      created_at: new Date().toISOString(),
      data: payload,
    });

    await Promise.allSettled(rows.map((t) => deliver(t, event, body)));
  } catch (e) {
    logger.error({ err: e, event, sellerId }, "[app-webhooks] dispatch failed");
  }
}
