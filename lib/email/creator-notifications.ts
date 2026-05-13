/**
 * Swypik Creator Notification Emails
 *
 * Sends transactional emails to creators for video moderation
 * decisions and payout confirmations.
 *
 * All emails go through the shared `sendEmail` pipeline which
 * handles Resend delivery + GDPR unsubscribe footer injection.
 */

import { sendEmail } from "@/lib/email/service";

const APP_URL = () =>
  (process.env.NEXT_PUBLIC_APP_URL || "https://swypik.com").replace(/\/$/, "");

/* ------------------------------------------------------------------ */
/*  Shared HTML helpers                                                */
/* ------------------------------------------------------------------ */

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (c) => {
    switch (c) {
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
        return c;
    }
  });
}

/**
 * Build the outer email shell consistent with Swypik's existing emails:
 *  – 600 px max-width, #F7F7F8 background, white card, Inter font
 *  – Dark header with brand name
 *  – Light footer
 */
function wrapEmail(innerHtml: string): string {
  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#F7F7F8;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <div style="max-width:600px;margin:40px auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.06)">

    <!-- Header -->
    <div style="background:#0D0D0D;padding:32px;text-align:center">
      <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:900;letter-spacing:0.5px">Swypik <span style="font-weight:400;font-size:14px;opacity:0.6">Creators</span></h1>
    </div>

    <!-- Content -->
    <div style="padding:32px 32px 24px">
      ${innerHtml}
    </div>

    <!-- Footer -->
    <div style="padding:24px 32px;background:#f8f9fa;text-align:center;border-top:1px solid #eee">
      <p style="margin:0;font-size:12px;color:#999">Swypik — Creează conținut, câștigă comisioane</p>
    </div>
  </div>
</body>
</html>`;
}

function ctaButton(label: string, href: string): string {
  return `
    <div style="text-align:center;margin-top:32px">
      <a href="${escapeHtml(href)}"
         style="display:inline-block;background:#10A37F;color:#ffffff;padding:14px 36px;border-radius:12px;font-size:14px;font-weight:700;text-decoration:none;box-shadow:0 4px 14px rgba(16,163,127,0.3)">
        ${label}
      </a>
    </div>`;
}

/* ------------------------------------------------------------------ */
/*  1. Video Approved                                                  */
/* ------------------------------------------------------------------ */

export async function notifyVideoApproved(
  creatorEmail: string,
  creatorName: string,
  videoTitle: string,
): Promise<boolean> {
  const safeName = escapeHtml(creatorName);
  const safeTitle = escapeHtml(videoTitle);

  const inner = `
    <div style="text-align:center;margin-bottom:24px">
      <div style="width:64px;height:64px;background:#10A37F20;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:28px">✅</div>
      <h2 style="margin:16px 0 4px;font-size:22px;font-weight:900;color:#0D0D0D">Clipul tău este LIVE!</h2>
    </div>
    <p style="font-size:15px;color:#333;line-height:1.7">
      Salut <strong>${safeName}</strong>,<br><br>
      Clipul tău «<strong>${safeTitle}</strong>» a fost aprobat și este acum
      <span style="color:#10A37F;font-weight:700">LIVE</span> în feed-ul Swypik! 🎉<br><br>
      Vei primi <strong>5% comision</strong> din fiecare vânzare generată prin clipul tău.
    </p>
    ${ctaButton("Vezi clipurile tale →", `${APP_URL()}/creator/videos`)}`;

  return sendEmail({
    to: creatorEmail,
    subject: "✅ Clipul tău a fost aprobat — Swypik",
    html: wrapEmail(inner),
  });
}

/* ------------------------------------------------------------------ */
/*  2. Video Rejected                                                  */
/* ------------------------------------------------------------------ */

export async function notifyVideoRejected(
  creatorEmail: string,
  creatorName: string,
  videoTitle: string,
  reason: string,
): Promise<boolean> {
  const safeName = escapeHtml(creatorName);
  const safeTitle = escapeHtml(videoTitle);
  const safeReason = escapeHtml(reason);

  const inner = `
    <div style="text-align:center;margin-bottom:24px">
      <div style="width:64px;height:64px;background:#FF6B6B20;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:28px">⚠️</div>
      <h2 style="margin:16px 0 4px;font-size:22px;font-weight:900;color:#0D0D0D">Clipul necesită modificări</h2>
    </div>
    <p style="font-size:15px;color:#333;line-height:1.7">
      Salut <strong>${safeName}</strong>,<br><br>
      Clipul «<strong>${safeTitle}</strong>» nu a putut fi publicat.
    </p>
    <div style="margin:20px 0;padding:16px 20px;background:#FFF5F5;border-left:4px solid #FF6B6B;border-radius:0 8px 8px 0">
      <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#FF6B6B;text-transform:uppercase;letter-spacing:1px">Motiv</p>
      <p style="margin:0;font-size:14px;color:#333;line-height:1.6">${safeReason}</p>
    </div>
    <p style="font-size:14px;color:#666;line-height:1.6">
      Te rugăm să încarci o versiune nouă a clipului care respectă cerințele platformei.
    </p>
    ${ctaButton("Încarcă clip nou →", `${APP_URL()}/creator/upload`)}`;

  return sendEmail({
    to: creatorEmail,
    subject: "Clipul tău necesită modificări — Swypik",
    html: wrapEmail(inner),
  });
}

/* ------------------------------------------------------------------ */
/*  3. Payout Sent                                                     */
/* ------------------------------------------------------------------ */

export async function notifyPayoutSent(
  creatorEmail: string,
  creatorName: string,
  amountLei: string,
): Promise<boolean> {
  const safeName = escapeHtml(creatorName);
  const safeAmount = escapeHtml(amountLei);

  const inner = `
    <div style="text-align:center;margin-bottom:24px">
      <div style="width:64px;height:64px;background:#10A37F20;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:28px">💰</div>
      <h2 style="margin:16px 0 4px;font-size:22px;font-weight:900;color:#0D0D0D">Ai primit plata!</h2>
    </div>
    <p style="font-size:15px;color:#333;line-height:1.7">
      Salut <strong>${safeName}</strong>,<br><br>
      Comisionul tău de <span style="font-size:20px;font-weight:900;color:#10A37F">${safeAmount} lei</span>
      a fost transferat cu succes în contul tău. 🎉
    </p>
    <div style="margin:24px 0;padding:20px;background:#f0fdf4;border-radius:12px;border:1px solid #bbf7d0;text-align:center">
      <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#10A37F;text-transform:uppercase;letter-spacing:1px">Sumă transferată</p>
      <p style="margin:0;font-size:28px;font-weight:900;color:#0D0D0D">${safeAmount} lei</p>
    </div>
    <p style="font-size:14px;color:#666;line-height:1.6;text-align:center">
      Continuă să creezi conținut excelent și câștigă mai mult!
    </p>
    ${ctaButton("Vezi câștigurile →", `${APP_URL()}/creator/earnings`)}`;

  return sendEmail({
    to: creatorEmail,
    subject: `💰 Ai primit ${amountLei} lei — Swypik`,
    html: wrapEmail(inner),
  });
}
