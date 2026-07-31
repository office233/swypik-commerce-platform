/**
 * Notificări Swypik Stays.
 *
 * La rezervare confirmată:
 *   - gazda: push + email („ai o rezervare nouă")
 *   - clientul: push + email de confirmare
 * Toate sunt best-effort: o eroare de notificare NU anulează rezervarea.
 */
import { dbQuery } from "@/lib/db";
import { sendPushToUser } from "@/lib/push/send";
import { sendEmail } from "@/lib/email/service";
import { logger } from "@/lib/logger";

const APP_URL = () => process.env.NEXT_PUBLIC_APP_URL || "https://swypik.com";

function fmtDate(d: string): string {
    try {
        return new Date(d).toLocaleDateString("ro-RO", { day: "2-digit", month: "long", year: "numeric" });
    } catch {
        return d;
    }
}

const lei = (cents: number) =>
    new Intl.NumberFormat("ro-RO", { style: "currency", currency: "RON", maximumFractionDigits: 2 }).format(cents / 100);

type BookingInfo = {
    bookingId: string;
    propertyTitle: string;
    checkIn: string;
    checkOut: string;
    guests: number;
    totalCents: number;
    hostUserId: string | null;
    guestUserId: string | null;
    guestName: string;
    guestEmail: string | null;
    guestPhone: string | null;
};

/** Datele necesare notificărilor, dintr-un singur query. */
export async function loadBookingInfo(bookingId: string): Promise<BookingInfo | null> {
    const { rows } = await dbQuery<any>(
        `SELECT b.id::text AS booking_id, p.title AS property_title,
                b.check_in::text, b.check_out::text, b.guests_count, b.total_cents,
                p.metadata->>'host_user_id' AS host_user_id,
                b.guest_user_id::text, b.guest_name, b.guest_email, b.guest_phone
           FROM stay_bookings b
           JOIN marketplace_products p ON p.id = b.product_id
          WHERE b.id = $1::uuid`,
        [bookingId],
    );
    const r = rows[0];
    if (!r) return null;
    return {
        bookingId: r.booking_id,
        propertyTitle: r.property_title,
        checkIn: r.check_in,
        checkOut: r.check_out,
        guests: r.guests_count,
        totalCents: r.total_cents,
        hostUserId: r.host_user_id,
        guestUserId: r.guest_user_id,
        guestName: r.guest_name,
        guestEmail: r.guest_email,
        guestPhone: r.guest_phone,
    };
}

async function hostEmail(hostUserId: string): Promise<string | null> {
    const { rows } = await dbQuery<{ email: string | null }>(
        `SELECT COALESCE(
                  (SELECT email FROM host_applications WHERE user_id = $1 AND status='approved'
                    ORDER BY reviewed_at DESC LIMIT 1),
                  (SELECT email FROM users WHERE id = $1)
                ) AS email`,
        [hostUserId],
    );
    return rows[0]?.email ?? null;
}

/** Notifică gazda că are o rezervare nouă (plătită). */
export async function notifyHostNewBooking(bookingId: string): Promise<void> {
    try {
        const b = await loadBookingInfo(bookingId);
        if (!b?.hostUserId) return;

        const period = `${fmtDate(b.checkIn)} → ${fmtDate(b.checkOut)}`;
        const url = `${APP_URL()}/stays/manage`;

        await sendPushToUser(b.hostUserId, {
            title: "Rezervare nouă! 🎉",
            body: `${b.propertyTitle}: ${period} · ${b.guests} ${b.guests === 1 ? "oaspete" : "oaspeți"} · ${lei(b.totalCents)}`,
            url: "/stays/manage",
            tag: `stay-booking-${b.bookingId}`,
            data: { bookingId: b.bookingId },
        }).catch((err) => logger.warn({ err, bookingId }, "stays: push gazdă eșuat"));

        const email = await hostEmail(b.hostUserId);
        if (email) {
            await sendEmail({
                to: email,
                subject: `Rezervare nouă: ${b.propertyTitle}`,
                html: `
                    <h2>Ai o rezervare nouă 🎉</h2>
                    <p><strong>${b.propertyTitle}</strong></p>
                    <table style="border-collapse:collapse">
                      <tr><td style="padding:4px 12px 4px 0">Perioadă:</td><td><strong>${period}</strong></td></tr>
                      <tr><td style="padding:4px 12px 4px 0">Oaspeți:</td><td>${b.guests}</td></tr>
                      <tr><td style="padding:4px 12px 4px 0">Client:</td><td>${b.guestName}${b.guestPhone ? ` · ${b.guestPhone}` : ""}</td></tr>
                      <tr><td style="padding:4px 12px 4px 0">Total plătit:</td><td><strong>${lei(b.totalCents)}</strong></td></tr>
                    </table>
                    <p style="margin-top:16px">Suma, minus comisionul Swypik, a fost virată în portofelul tău.</p>
                    <p><a href="${url}" style="background:#0D9488;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Vezi rezervările</a></p>
                `,
            }).catch((err) => logger.warn({ err, bookingId }, "stays: email gazdă eșuat"));
        }
        logger.info({ bookingId, hostUserId: b.hostUserId }, "stays: gazdă notificată");
    } catch (err) {
        logger.error({ err, bookingId }, "stays: notificare gazdă eșuată");
    }
}

/** Confirmare pentru client. */
export async function notifyGuestBookingConfirmed(bookingId: string): Promise<void> {
    try {
        const b = await loadBookingInfo(bookingId);
        if (!b) return;

        const period = `${fmtDate(b.checkIn)} → ${fmtDate(b.checkOut)}`;

        if (b.guestUserId) {
            await sendPushToUser(b.guestUserId, {
                title: "Rezervare confirmată ✅",
                body: `${b.propertyTitle}: ${period}`,
                url: "/account",
                tag: `stay-guest-${b.bookingId}`,
            }).catch((err) => logger.warn({ err, bookingId }, "stays: push client eșuat"));
        }

        if (b.guestEmail) {
            await sendEmail({
                to: b.guestEmail,
                subject: `Rezervare confirmată: ${b.propertyTitle}`,
                html: `
                    <h2>Rezervarea ta e confirmată ✅</h2>
                    <p><strong>${b.propertyTitle}</strong></p>
                    <table style="border-collapse:collapse">
                      <tr><td style="padding:4px 12px 4px 0">Perioadă:</td><td><strong>${period}</strong></td></tr>
                      <tr><td style="padding:4px 12px 4px 0">Oaspeți:</td><td>${b.guests}</td></tr>
                      <tr><td style="padding:4px 12px 4px 0">Total:</td><td><strong>${lei(b.totalCents)}</strong></td></tr>
                    </table>
                    <p style="margin-top:16px">Prețul afișat a fost prețul final — fără taxe ascunse.</p>
                    <p><a href="${APP_URL()}/account" style="background:#0D9488;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Vezi rezervarea</a></p>
                `,
            }).catch((err) => logger.warn({ err, bookingId }, "stays: email client eșuat"));
        }
    } catch (err) {
        logger.error({ err, bookingId }, "stays: notificare client eșuată");
    }
}
