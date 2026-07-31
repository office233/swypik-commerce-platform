/**
 * Swypik Email Service
 * Uses Resend for transactional emails (order confirmation, shipping, etc.)
 * 
 * Setup: Add RESEND_API_KEY to .env.local
 * Get a free key at https://resend.com (100 emails/day free)
 * 
 * If no API key is configured, emails are logged to console (dev mode).
 */

import { sendMail, activeProvider } from "./transport";
import { createHmac } from "node:crypto";
import { isEnabled } from "@/lib/feature-flags";
import { dbQuery } from "@/lib/db";
import { logger } from "@/lib/logger";
import { APP_URL } from "@/lib/app-url";
import { SUPPORT_EMAIL } from "@/lib/contact";

const log = logger.child({ service: "email" });

function maskEmail(e: string | null | undefined): string {
  if (!e || typeof e !== "string" || !e.includes("@")) return "<none>";
  const [user, domain] = e.split("@");
  return `${user.slice(0, 2)}***@${domain}`;
}

export function unsubscribeToken(email: string): string {
  let secret = process.env.APP_ENCRYPTION_KEY || process.env.SESSION_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      logger.error(
        "APP_ENCRYPTION_KEY/SESSION_SECRET lipsesc în producție — tokenurile de unsubscribe folosesc un fallback NESIGUR. Setează APP_ENCRYPTION_KEY."
      );
    }
    secret = "swypik-unsubscribe-fallback";
  }
  return createHmac("sha256", secret).update(email.toLowerCase()).digest("hex").slice(0, 32);
}

export function unsubscribeUrl(email: string): string {
  const base = APP_URL;
  const t = unsubscribeToken(email);
  return `${base}/api/unsubscribe?email=${encodeURIComponent(email)}&t=${t}`;
}

async function isUnsubscribed(email: string): Promise<boolean> {
  try {
    const res = await dbQuery<{ ok: number }>(
      `SELECT 1 AS ok FROM email_unsubscribes WHERE email_lower = lower($1) LIMIT 1`,
      [email]
    );
    return (res.rows?.length || 0) > 0;
  } catch (e) {
    console.warn("[email] unsubscribes check failed:", (e as Error).message);
    return false;
  }
}

const FROM_EMAIL = process.env.EMAIL_FROM || "Swypik <onboarding@resend.dev>";

function emailReady(): boolean {
  return activeProvider() !== "none";
}

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return char;
    }
  });
}

interface OrderEmailData {
  orderId: string;
  orderLookupToken?: string;
  customerEmail: string;
  customerName: string;
  items: { title: string; quantity: number; price: number }[];
  totalRon: number;
  shippingAddress?: {
    name?: string;
    line1?: string;
    city?: string;
    postal_code?: string;
    country?: string;
  };
  trackingNumber?: string;
  trackingUrl?: string;
}

/**
 * Send OTP / Magic Link token
 */
export async function sendMagicLink(email: string, token: string): Promise<boolean> {
  const html = `
  <div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:20px;text-align:center;">
    <h2>Autentificare Swypik</h2>
    <p>Codul tău de acces este:</p>
    <div style="font-size:32px;font-weight:bold;letter-spacing:4px;margin:20px 0;padding:10px;background:#f5f5f5;border-radius:8px;">${token}</div>
    <p style="color:#666;font-size:12px;">Acest cod expiră în 15 minute. Nu-l oferi nimănui.</p>
  </div>`;

  if (!emailReady()) {
    // Dev fallback — auth route returns devOtp; suppress noisy console dump in prod.
    if (process.env.NODE_ENV !== "production") {
      log.warn({ to: maskEmail(email), token }, "MAGIC LINK OTP (dev mode — no RESEND_API_KEY)");
    } else {
      log.warn({ to: maskEmail(email) }, "magic link skipped — RESEND_API_KEY missing");
    }
    return true;
  }

  try {
    await sendMail({
      to: email,
      subject: "Codul tău de acces Swypik",
      html,
    });
    return true;
  } catch (error) {
    console.error("Failed to send OTP email:", error);
    return false;
  }
}

/**
 * Send order confirmation email after successful payment
 */
export async function sendOrderConfirmation(data: OrderEmailData): Promise<boolean> {
  if (!isEnabled("emailMarketing")) {
    log.info({ fn: "sendOrderConfirmation", to: maskEmail(data.customerEmail) }, "email skipped — marketing disabled");
    return true;
  }
  const trackingUrl = orderTrackingUrl(data);
  const itemsHtml = data.items.map(i =>
    `<tr>
      <td style="padding:12px 8px;border-bottom:1px solid #f0f0f0;font-size:14px;color:#333">${escapeHtml(i.title)}</td>
      <td style="padding:12px 8px;border-bottom:1px solid #f0f0f0;text-align:center;font-size:14px;color:#666">${i.quantity}</td>
      <td style="padding:12px 8px;border-bottom:1px solid #f0f0f0;text-align:right;font-size:14px;font-weight:700;color:#333">${(i.price * i.quantity).toFixed(2)} lei</td>
    </tr>`
  ).join("");

  const addressHtml = data.shippingAddress ? `
    <div style="margin-top:24px;padding:16px;background:#f8f9fa;border-radius:12px">
      <p style="margin:0 0 8px;font-size:12px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:1px">Adresă de livrare</p>
      <p style="margin:0;font-size:14px;color:#333">${escapeHtml(data.shippingAddress.name || "")}</p>
      <p style="margin:0;font-size:14px;color:#666">${escapeHtml(data.shippingAddress.line1 || "")}</p>
      <p style="margin:0;font-size:14px;color:#666">${escapeHtml(data.shippingAddress.city || "")}, ${escapeHtml(data.shippingAddress.postal_code || "")}</p>
    </div>` : "";

  const html = `
  <!DOCTYPE html>
  <html>
  <body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
    <div style="max-width:560px;margin:40px auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.06)">
      
      <!-- Header -->
      <div style="background:#0D0D0D;padding:32px;text-align:center">
        <h1 style="margin:0;color:white;font-size:24px;font-weight:900">Swypik</h1>
      </div>
      
      <!-- Content -->
      <div style="padding:32px">
        <div style="text-align:center;margin-bottom:24px">
          <div style="width:64px;height:64px;background:#0D0D0D20;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:28px">✅</div>
          <h2 style="margin:16px 0 4px;font-size:22px;font-weight:900;color:#0D0D0D">Comandă confirmată!</h2>
          <p style="margin:0;font-size:14px;color:#888">Comanda #${data.orderId.split("-")[0]} a fost plasată cu succes.</p>
        </div>
        
        <p style="font-size:15px;color:#333;line-height:1.6">
          Bună, ${escapeHtml(data.customerName || "acolo")}! 👋<br>
          Mulțumim pentru comandă. Mai jos găsești detaliile:
        </p>
        
        <!-- Items Table -->
        <table style="width:100%;border-collapse:collapse;margin:24px 0">
          <thead>
            <tr style="border-bottom:2px solid #0D0D0D">
              <th style="padding:8px;text-align:left;font-size:11px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:1px">Produs</th>
              <th style="padding:8px;text-align:center;font-size:11px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:1px">Cant.</th>
              <th style="padding:8px;text-align:right;font-size:11px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:1px">Preț</th>
            </tr>
          </thead>
          <tbody>${itemsHtml}</tbody>
          <tfoot>
            <tr>
              <td colspan="2" style="padding:16px 8px 0;font-size:16px;font-weight:900;color:#0D0D0D">Total</td>
              <td style="padding:16px 8px 0;text-align:right;font-size:18px;font-weight:900;color:#0D0D0D">${data.totalRon.toFixed(2)} lei</td>
            </tr>
          </tfoot>
        </table>
        
        ${addressHtml}
        
        <!-- CTA -->
        <div style="text-align:center;margin-top:32px">
          <a href="${escapeHtml(trackingUrl)}" 
             style="display:inline-block;background:#0D0D0D;color:white;padding:14px 32px;border-radius:12px;font-size:14px;font-weight:700;text-decoration:none">
            📦 Urmărește comanda
          </a>
        </div>
      </div>
      
      <!-- Footer -->
      <div style="padding:24px 32px;background:#f8f9fa;text-align:center;border-top:1px solid #eee">
        <p style="margin:0;font-size:12px;color:#999">Swypik — Shopping inteligent, powered by AI</p>
      </div>
    </div>
  </body>
  </html>`;

  return sendEmail({
    to: data.customerEmail,
    subject: `✅ Comandă confirmată #${data.orderId.split("-")[0]} — Swypik`,
    html,
  });
}

/**
 * Send shipping notification email with tracking info
 */
export async function sendShippingNotification(data: OrderEmailData): Promise<boolean> {
  if (!isEnabled("emailMarketing")) {
    log.info({ fn: "sendShippingNotification", to: maskEmail(data.customerEmail) }, "email skipped — marketing disabled");
    return true;
  }
  const trackingUrl = orderTrackingUrl(data);
  const html = `
  <!DOCTYPE html>
  <html>
  <body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
    <div style="max-width:560px;margin:40px auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.06)">
      
      <div style="background:#0D0D0D;padding:32px;text-align:center">
        <h1 style="margin:0;color:white;font-size:24px;font-weight:900">Swypik</h1>
      </div>
      
      <div style="padding:32px">
        <div style="text-align:center;margin-bottom:24px">
          <div style="width:64px;height:64px;background:#0D0D0D20;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:28px">🚚</div>
          <h2 style="margin:16px 0 4px;font-size:22px;font-weight:900;color:#0D0D0D">Coletul tău e pe drum!</h2>
          <p style="margin:0;font-size:14px;color:#888">Comanda #${data.orderId.split("-")[0]} a fost expediată.</p>
        </div>
        
        <p style="font-size:15px;color:#333;line-height:1.6">
          Bună, ${escapeHtml(data.customerName || "acolo")}! 👋<br>
          Comanda ta a fost expediată și este pe drum către tine.
        </p>
        
        ${data.trackingNumber ? `
        <div style="margin:24px 0;padding:20px;background:#f0fdf4;border-radius:12px;border:1px solid #bbf7d0;text-align:center">
          <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#0D0D0D;text-transform:uppercase;letter-spacing:1px">Cod de urmărire</p>
          <p style="margin:0;font-size:22px;font-weight:900;font-family:monospace;color:#0D0D0D">${escapeHtml(data.trackingNumber)}</p>
          ${data.trackingUrl ? `<a href="${escapeHtml(data.trackingUrl)}" style="display:inline-block;margin-top:12px;color:#0D0D0D;font-size:13px;font-weight:700">Urmărește coletul →</a>` : ""}
        </div>` : ""}
        
        <div style="text-align:center;margin-top:32px">
          <a href="${escapeHtml(trackingUrl)}" 
             style="display:inline-block;background:#0D0D0D;color:white;padding:14px 32px;border-radius:12px;font-size:14px;font-weight:700;text-decoration:none">
            📦 Urmărește comanda
          </a>
        </div>
      </div>
      
      <div style="padding:24px 32px;background:#f8f9fa;text-align:center;border-top:1px solid #eee">
        <p style="margin:0;font-size:12px;color:#999">Swypik — Shopping inteligent, powered by AI</p>
      </div>
    </div>
  </body>
  </html>`;

  return sendEmail({
    to: data.customerEmail,
    subject: `🚚 Coletul tău e pe drum! Comanda #${data.orderId.split("-")[0]} — Swypik`,
    html,
  });
}

function orderTrackingUrl(data: OrderEmailData): string {
  const appUrl = APP_URL;
  const lookup = data.orderLookupToken || data.orderId;
  return `${appUrl}/orders/${encodeURIComponent(lookup)}`;
}

/**
 * Core email sender — uses Resend if configured, logs to console otherwise
 */
export async function sendEmail(params: { to: string; subject: string; html: string; marketing?: boolean }): Promise<boolean> {
  if (!params.to || !params.to.includes("@")) {
    console.warn("[Email] Invalid recipient:", params.to);
    return false;
  }

  // Suppress marketing emails for unsubscribed recipients
  if (params.marketing && (await isUnsubscribed(params.to))) {
    log.info({ to: maskEmail(params.to), subject: params.subject }, "email suppressed (unsubscribed)");
    return true;
  }

  const supportEmail = SUPPORT_EMAIL;
  const oneClickUrl = unsubscribeUrl(params.to);
  const mailtoUrl = `mailto:${supportEmail}?subject=${encodeURIComponent("Dezabonare Swypik")}&body=${encodeURIComponent(`Te rog dezaboneaza ${params.to} de la emailurile Swypik.`)}`;
  const safeUnsubscribeUrl = escapeHtml(oneClickUrl);

  // Inject GDPR/CAN-SPAM unsubscribe footer into all emails
  const unsubscribeFooter = `
    <div style="text-align:center;padding:16px 32px 24px;font-size:11px;color:#bbb">
      <p style="margin:0">Nu mai dorești să primești emailuri de la Swypik?</p>
      <p style="margin:4px 0 0"><a href="${safeUnsubscribeUrl}" style="color:#999;text-decoration:underline">Dezabonează-te</a></p>
    </div>`;

  // Insert footer before closing </body> or append at the end
  const finalHtml = params.html.includes("</body>")
    ? params.html.replace("</body>", `${unsubscribeFooter}</body>`)
    : params.html + unsubscribeFooter;

  if (!emailReady()) {
    log.warn({ to: maskEmail(params.to), subject: params.subject }, "email skipped — niciun provider configurat (dev mode)");
    return true; // Don't fail in dev
  }

  try {
    const marketingHeaders = params.marketing
      ? {
        "List-Unsubscribe": `<${oneClickUrl}>, <${mailtoUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      }
      : undefined;
    const ok = await sendMail({
      to: params.to,
      subject: params.subject,
      html: finalHtml,
      ...(marketingHeaders ? { headers: marketingHeaders } : {}),
    });

    if (!ok) {
      log.error({ to: maskEmail(params.to) }, "email send failed");
      return false;
    }

    log.info({ to: maskEmail(params.to) }, "email sent");
    return true;
  } catch (e: any) {
    log.error({ err: e, to: maskEmail(params.to) }, "email send error");
    return false;
  }
}

/**
 * Send an alert to a seller about a new order
 */
export async function sendSellerNewOrderAlert(sellerEmail: string, orderItems: any[], customerName: string = 'X'): Promise<boolean> {
  if (!isEnabled("emailMarketing")) {
    log.info({ fn: "sendSellerNewOrderAlert", to: maskEmail(sellerEmail) }, "email skipped — marketing disabled");
    return true;
  }
  const itemsHtml = orderItems.map(i =>
    `<tr>
      <td style="padding:12px 8px;border-bottom:1px solid #f0f0f0;font-size:14px;color:#333">${escapeHtml(i.title || i.name || 'Produs')}</td>
      <td style="padding:12px 8px;border-bottom:1px solid #f0f0f0;text-align:center;font-size:14px;color:#666">${i.quantity || 1}</td>
    </tr>`
  ).join("");

  const html = `
  <!DOCTYPE html>
  <html>
  <body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
    <div style="max-width:560px;margin:40px auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.06)">
      <div style="background:#0D0D0D;padding:32px;text-align:center">
        <h1 style="margin:0;color:white;font-size:24px;font-weight:900">Swypik Sellers</h1>
      </div>
      <div style="padding:32px">
        <h2 style="margin:16px 0 4px;font-size:22px;font-weight:900;color:#0D0D0D;text-align:center;">Ai o comandă nouă! 🎉</h2>
        <p style="font-size:15px;color:#333;line-height:1.6;margin-top:24px;">
          Salut, ai o comandă nouă de la clientul ${escapeHtml(customerName)} pentru produsele:
        </p>
        <table style="width:100%;border-collapse:collapse;margin:24px 0">
          <thead>
            <tr style="border-bottom:2px solid #0D0D0D">
              <th style="padding:8px;text-align:left;font-size:11px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:1px">Produs</th>
              <th style="padding:8px;text-align:center;font-size:11px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:1px">Cant.</th>
            </tr>
          </thead>
          <tbody>${itemsHtml}</tbody>
        </table>
        <p style="font-size:15px;color:#333;line-height:1.6;">
          Loghează-te în dashboard să o expediezi!
        </p>
        <div style="text-align:center;margin-top:32px">
          <a href="${APP_URL}/seller" 
             style="display:inline-block;background:#0D0D0D;color:white;padding:14px 32px;border-radius:12px;font-size:14px;font-weight:700;text-decoration:none">
            🚀 Mergi la Dashboard
          </a>
        </div>
      </div>
    </div>
  </body>
  </html>`;

  return sendEmail({
    to: sellerEmail,
    subject: "🎉 Ai o comandă nouă! — Swypik",
    html,
  });
}

/**
 * Send an email to notify a seller that their account has been approved
 */
export async function sendSellerApprovalEmail(email: string, name: string): Promise<boolean> {
  if (!isEnabled("emailMarketing")) {
    log.info({ fn: "sendSellerApprovalEmail", to: maskEmail(email) }, "email skipped — marketing disabled");
    return true;
  }
  const html = `
  <!DOCTYPE html>
  <html>
  <body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
    <div style="max-width:560px;margin:40px auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.06)">
      <div style="background:#0D0D0D;padding:32px;text-align:center">
        <h1 style="margin:0;color:white;font-size:24px;font-weight:900">Swypik Sellers</h1>
      </div>
      <div style="padding:32px;text-align:center;">
        <div style="width:64px;height:64px;background:#0D0D0D20;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:28px;margin:0 auto 24px;">🎉</div>
        <h2 style="margin:0 0 16px;font-size:22px;font-weight:900;color:#0D0D0D;">Felicitări!</h2>
        <p style="font-size:15px;color:#333;line-height:1.6;margin-bottom:24px;">
          Salut ${escapeHtml(name)}, contul tău de Seller Swypik a fost aprobat!
        </p>
        <p style="font-size:15px;color:#333;line-height:1.6;margin-bottom:32px;">
          Acum poți să îți adaugi produsele și să începi să vinzi pe platforma noastră.
        </p>
        <a href="${APP_URL}/seller/login" 
           style="display:inline-block;background:#0D0D0D;color:white;padding:14px 32px;border-radius:12px;font-size:14px;font-weight:700;text-decoration:none">
          Autentifică-te aici
        </a>
      </div>
    </div>
  </body>
  </html>`;

  return sendEmail({
    to: email,
    subject: "Contul tău de Seller a fost aprobat! 🎉 — Swypik",
    html,
  });
}

/**
 * Send tracking update to customer
 */
export async function sendCustomerShippingAlert(email: string, trackingNumber: string): Promise<boolean> {
  if (!isEnabled("emailMarketing")) {
    log.info({ fn: "sendCustomerShippingAlert", to: maskEmail(email) }, "email skipped — marketing disabled");
    return true;
  }
  const html = `
  <!DOCTYPE html>
  <html>
  <body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
    <div style="max-width:560px;margin:40px auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.06)">
      <div style="background:#0D0D0D;padding:32px;text-align:center">
        <h1 style="margin:0;color:white;font-size:24px;font-weight:900">Swypik</h1>
      </div>
      <div style="padding:32px;text-align:center;">
        <div style="width:64px;height:64px;background:#0D0D0D20;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:28px;margin:0 auto 24px;">📦</div>
        <h2 style="margin:0 0 16px;font-size:22px;font-weight:900;color:#0D0D0D;">Comanda ta a fost expediată!</h2>
        <p style="font-size:15px;color:#333;line-height:1.6;margin-bottom:24px;">
          Pachetul tău a fost predat curierului. Îl poți urmări folosind numărul de AWB de mai jos:
        </p>
        <div style="font-size:24px;font-weight:bold;letter-spacing:2px;margin:20px 0;padding:16px;background:#f5f5f5;border-radius:8px;font-family:monospace;">
          ${escapeHtml(trackingNumber)}
        </div>
      </div>
    </div>
  </body>
  </html>`;

  return sendEmail({
    to: email,
    subject: "Comanda ta a fost expediată! 📦 — Swypik",
    html,
  });
}

/**
 * Send abandoned cart recovery email to customers who left items in checkout
 */
export interface AbandonedCartItem {
  title: string;
  price: number;
  image?: string;
  quantity?: number;
}

export async function sendAbandonedCartEmail(
  email: string,
  cartItems: AbandonedCartItem[],
  checkoutUrl: string,
): Promise<boolean> {
  if (!isEnabled("emailMarketing")) {
    log.info({ fn: "sendAbandonedCartEmail", to: maskEmail(email) }, "email skipped — marketing disabled");
    return true;
  }
  const itemsHtml = cartItems
    .map(
      (item) => {
        const title = escapeHtml(item.title);
        const image = item.image ? escapeHtml(item.image) : null;
        const quantity = Math.max(1, Number(item.quantity || 1));
        const price = Number.isFinite(item.price) ? item.price : 0;

        return `
      <tr>
        <td style="padding:12px 8px;border-bottom:1px solid #f0f0f0;vertical-align:middle">
          ${image
            ? `<img src="${image}" alt="${title}" style="width:56px;height:56px;object-fit:cover;border-radius:8px;display:block" />`
            : `<div style="width:56px;height:56px;background:#f0f0f0;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:22px">🛍️</div>`
          }
        </td>
        <td style="padding:12px 8px;border-bottom:1px solid #f0f0f0;font-size:14px;color:#333;vertical-align:middle">
          ${title}
          ${quantity > 1 ? `<span style="color:#888;font-size:12px"> x ${quantity}</span>` : ""}
        </td>
        <td style="padding:12px 8px;border-bottom:1px solid #f0f0f0;text-align:right;font-size:14px;font-weight:700;color:#0D0D0D;vertical-align:middle;white-space:nowrap">
          ${(price * quantity).toFixed(2)} lei
        </td>
      </tr>`;
      },
    )
    .join("");

  const totalRon = cartItems.reduce(
    (sum, item) => sum + item.price * (item.quantity || 1),
    0,
  );
  const safeCheckoutUrl = escapeHtml(checkoutUrl);

  const html = `
  <!DOCTYPE html>
  <html>
  <body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
    <div style="max-width:560px;margin:40px auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.06)">

      <!-- Header -->
      <div style="background:#0D0D0D;padding:32px;text-align:center">
        <h1 style="margin:0;color:white;font-size:24px;font-weight:900">Swypik</h1>
      </div>

      <!-- Content -->
      <div style="padding:32px">
        <div style="text-align:center;margin-bottom:24px">
          <div style="width:64px;height:64px;background:#FFF3E020;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:32px">🛒</div>
          <h2 style="margin:16px 0 4px;font-size:22px;font-weight:900;color:#0D0D0D">Ai uitat ceva în coș?</h2>
          <p style="margin:0;font-size:14px;color:#888">Produsele tale te așteaptă încă!</p>
        </div>

        <p style="font-size:15px;color:#333;line-height:1.6">
          Bună! 👋<br>
          Am observat că ai lăsat câteva produse grozave în coș.
          Nu-ți face griji — le-am păstrat pentru tine.
          Finalizează comanda acum înainte să se epuizeze!
        </p>

        <!-- Items Table -->
        <table style="width:100%;border-collapse:collapse;margin:24px 0">
          <thead>
            <tr style="border-bottom:2px solid #0D0D0D">
              <th style="padding:8px;text-align:left;font-size:11px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:1px" width="64"></th>
              <th style="padding:8px;text-align:left;font-size:11px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:1px">Produs</th>
              <th style="padding:8px;text-align:right;font-size:11px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:1px">Preț</th>
            </tr>
          </thead>
          <tbody>${itemsHtml}</tbody>
          <tfoot>
            <tr>
              <td colspan="2" style="padding:16px 8px 0;font-size:16px;font-weight:900;color:#0D0D0D">Total</td>
              <td style="padding:16px 8px 0;text-align:right;font-size:18px;font-weight:900;color:#0D0D0D">${totalRon.toFixed(2)} lei</td>
            </tr>
          </tfoot>
        </table>

        <!-- CTA Button -->
        <div style="text-align:center;margin-top:32px">
          <a href="${safeCheckoutUrl}"
             style="display:inline-block;background:linear-gradient(135deg,#0D0D0D,#0D8F6F);color:white;padding:18px 48px;border-radius:14px;font-size:16px;font-weight:800;text-decoration:none;box-shadow:0 4px 16px rgba(16,163,127,0.35);letter-spacing:0.3px">
            🛒 Finalizează Comanda
          </a>
        </div>

        <p style="text-align:center;margin-top:20px;font-size:12px;color:#aaa">
          Link-ul este valabil 48 de ore de la primirea acestui email.
        </p>
      </div>

      <!-- Footer -->
      <div style="padding:24px 32px;background:#f8f9fa;text-align:center;border-top:1px solid #eee">
        <p style="margin:0;font-size:12px;color:#999">Swypik — Shopping inteligent, powered by AI</p>
        <p style="margin:8px 0 0;font-size:11px;color:#bbb">
          Dacă ai finalizat deja comanda, te rugăm să ignori acest email.
        </p>
        <p style="margin:8px 0 0;font-size:11px;color:#bbb">
          <a href="${escapeHtml(unsubscribeUrl(email))}" style="color:#999;text-decoration:underline">Dezabonare</a>
        </p>
      </div>
    </div>
  </body>
  </html>`;

  return sendEmail({
    to: email,
    subject: "Ai uitat ceva în coș! 🛒 — Swypik",
    html,
    marketing: true,
  });
}

/**
 * Welcome email (transactional — sent on signup, NOT gated by emailMarketing flag)
 */
export async function sendWelcomeEmail(email: string, name: string): Promise<boolean> {
  const appUrl = APP_URL;
  const safeName = escapeHtml(name || "acolo");
  const exploreUrl = escapeHtml(`${appUrl}/explore`);
  const accountUrl = escapeHtml(`${appUrl}/account`);
  const html = `
  <!DOCTYPE html>
  <html>
  <body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
    <div style="max-width:560px;margin:40px auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.06)">
      <div style="background:#7C3AED;padding:32px;text-align:center">
        <h1 style="margin:0;color:white;font-size:24px;font-weight:900">Swypik</h1>
      </div>
      <div style="padding:32px">
        <h2 style="margin:0 0 16px;font-size:22px;font-weight:900;color:#0D0D0D">Bun venit, ${safeName}! 👋</h2>
        <p style="font-size:15px;color:#333;line-height:1.6">
          Ne bucurăm că ești aici. Swypik e marketplace-ul tău video: descoperă produse, urmărește creatori și cumpără direct din feed.
        </p>
        <div style="text-align:center;margin:32px 0">
          <a href="${exploreUrl}" style="display:inline-block;background:#7C3AED;color:white;padding:14px 32px;border-radius:12px;font-size:14px;font-weight:700;text-decoration:none;margin:4px">🎥 Explorează feed</a>
          <a href="${accountUrl}" style="display:inline-block;background:#0D0D0D;color:white;padding:14px 32px;border-radius:12px;font-size:14px;font-weight:700;text-decoration:none;margin:4px">⚙️ Contul tău</a>
        </div>
        <p style="font-size:13px;color:#666;line-height:1.6">
          Dacă ai întrebări, scrie-ne oricând la <a href="mailto:${SUPPORT_EMAIL}" style="color:#7C3AED">${SUPPORT_EMAIL}</a>.
        </p>
      </div>
      <div style="padding:24px 32px;background:#f8f9fa;text-align:center;border-top:1px solid #eee">
        <p style="margin:0;font-size:12px;color:#999">Swypik — Shopping inteligent, powered by AI</p>
      </div>
    </div>
  </body>
  </html>`;
  return sendEmail({
    to: email,
    subject: "Bun venit pe Swypik! 🎉",
    html,
  });
}

/**
 * Refund confirmation (transactional — NOT gated by emailMarketing flag)
 */
export async function sendRefundEmail(
  toEmail: string,
  orderId: string,
  amountCents: number,
  currency: string,
): Promise<boolean> {
  const amount = (Math.max(0, amountCents) / 100).toFixed(2);
  const safeCurrency = escapeHtml((currency || "RON").toUpperCase());
  const shortId = orderId.split("-")[0];
  const appUrl = APP_URL;
  const orderUrl = escapeHtml(`${appUrl}/orders/${encodeURIComponent(orderId)}`);
  const html = `
  <!DOCTYPE html>
  <html>
  <body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
    <div style="max-width:560px;margin:40px auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.06)">
      <div style="background:#0D0D0D;padding:32px;text-align:center">
        <h1 style="margin:0;color:white;font-size:24px;font-weight:900">Swypik</h1>
      </div>
      <div style="padding:32px;text-align:center">
        <div style="width:64px;height:64px;background:#10B98120;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:28px;margin:0 auto 16px;">💸</div>
        <h2 style="margin:0 0 8px;font-size:22px;font-weight:900;color:#0D0D0D">Rambursare confirmată</h2>
        <p style="margin:0 0 16px;font-size:14px;color:#888">Comanda #${escapeHtml(shortId)}</p>
        <p style="font-size:15px;color:#333;line-height:1.6;text-align:left">
          Ți-am procesat o rambursare în valoare de <strong>${amount} ${safeCurrency}</strong>.
          Banii vor reveni în contul tău în 5-10 zile lucrătoare, în funcție de banca emitentă.
        </p>
        <div style="margin-top:32px">
          <a href="${orderUrl}" style="display:inline-block;background:#0D0D0D;color:white;padding:14px 32px;border-radius:12px;font-size:14px;font-weight:700;text-decoration:none">Vezi comanda</a>
        </div>
      </div>
      <div style="padding:24px 32px;background:#f8f9fa;text-align:center;border-top:1px solid #eee">
        <p style="margin:0;font-size:12px;color:#999">Swypik — Întrebări? <a href="mailto:${SUPPORT_EMAIL}" style="color:#7C3AED">${SUPPORT_EMAIL}</a></p>
      </div>
    </div>
  </body>
  </html>`;
  return sendEmail({
    to: toEmail,
    subject: `💸 Rambursare confirmată — Comanda #${shortId}`,
    html,
  });
}
