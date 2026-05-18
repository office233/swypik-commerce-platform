/**
 * Swypik Email Service
 * Uses Resend for transactional emails (order confirmation, shipping, etc.)
 * 
 * Setup: Add RESEND_API_KEY to .env.local
 * Get a free key at https://resend.com (100 emails/day free)
 * 
 * If no API key is configured, emails are logged to console (dev mode).
 */

import { Resend } from "resend";
import { isEnabled } from "@/lib/feature-flags";

const FROM_EMAIL = process.env.EMAIL_FROM || "Swypik <onboarding@resend.dev>";
const resendKey = process.env.RESEND_API_KEY;

let resend: Resend | null = null;
function getResend() {
  if (!resend && resendKey) resend = new Resend(resendKey);
  return resend;
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

  if (!getResend()) {
    // Always log to console — auth route handles devOtp fallback
    console.log(`\n\n=== MAGIC LINK OTP FOR ${email} ===\nTOKEN: ${token}\n===================================\n\n`);
    return true;
  }

  try {
    await getResend()!.emails.send({
      from: FROM_EMAIL,
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
    console.log("[email] marketing disabled, skipped:", "sendOrderConfirmation", data.customerEmail);
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
    console.log("[email] marketing disabled, skipped:", "sendShippingNotification", data.customerEmail);
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
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://swypik.com").replace(/\/$/, "");
  const lookup = data.orderLookupToken || data.orderId;
  return `${appUrl}/orders/${encodeURIComponent(lookup)}`;
}

/**
 * Core email sender — uses Resend if configured, logs to console otherwise
 */
export async function sendEmail(params: { to: string; subject: string; html: string }): Promise<boolean> {
  if (!params.to || !params.to.includes("@")) {
    console.warn("[Email] Invalid recipient:", params.to);
    return false;
  }

  const supportEmail = process.env.SUPPORT_EMAIL || "support@swypik.com";
  const unsubscribeUrl = `mailto:${supportEmail}?subject=${encodeURIComponent("Dezabonare Swypik")}&body=${encodeURIComponent(`Te rog dezaboneaza ${params.to} de la emailurile Swypik.`)}`;
  const safeUnsubscribeUrl = escapeHtml(unsubscribeUrl);

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

  const client = getResend();

  if (!client) {
    console.log(`[Email] 📧 DEV MODE — Would send to: ${params.to}`);
    console.log(`[Email] Subject: ${params.subject}`);
    console.log(`[Email] (Set RESEND_API_KEY in .env.local to send real emails)`);
    return true; // Don't fail in dev
  }

  try {
    const { data, error } = await client.emails.send({
      from: FROM_EMAIL,
      to: params.to,
      subject: params.subject,
      html: finalHtml,
    });

    if (error) {
      console.error("[Email] ❌ Send failed:", error);
      return false;
    }

    console.log(`[Email] ✅ Sent to ${params.to} — ID: ${data?.id}`);
    return true;
  } catch (e: any) {
    console.error("[Email] ❌ Error:", e.message);
    return false;
  }
}

/**
 * Send an alert to a seller about a new order
 */
export async function sendSellerNewOrderAlert(sellerEmail: string, orderItems: any[], customerName: string = 'X'): Promise<boolean> {
  if (!isEnabled("emailMarketing")) {
    console.log("[email] marketing disabled, skipped:", "sendSellerNewOrderAlert", sellerEmail);
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
          <a href="${process.env.NEXT_PUBLIC_APP_URL || "https://swypik.com"}/seller" 
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
    console.log("[email] marketing disabled, skipped:", "sendSellerApprovalEmail", email);
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
        <a href="${process.env.NEXT_PUBLIC_APP_URL || "https://swypik.com"}/seller/login" 
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
    console.log("[email] marketing disabled, skipped:", "sendCustomerShippingAlert", email);
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
    console.log("[email] marketing disabled, skipped:", "sendAbandonedCartEmail", email);
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
          ${
            image
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
      </div>
    </div>
  </body>
  </html>`;

  return sendEmail({
    to: email,
    subject: "Ai uitat ceva în coș! 🛒 — Swypik",
    html,
  });
}
