/**
 * Rezervări cazări (gazde Swypik) — serviciu de business.
 *
 * Flux wallet:
 *   1. verifică disponibilitatea (stay_availability + rezervări existente)
 *   2. INSERT stay_bookings status=pending (exclusion constraint blochează
 *      dubla rezervare la nivel de DB — sursă de adevăr, nu doar verificarea)
 *   3. debitUser idempotent pe booking id
 *   4. status=confirmed, payment_status=paid
 *   5. eșec plată → rezervarea se anulează (eliberează intervalul)
 *
 * Comision: Swypik reține STAYS_COMMISSION_PCT (default 10%) din total.
 * Gazda primește restul — payout-ul se face separat (ledger).
 */
import { dbQuery } from "@/lib/db";
import { debitUser, creditUser, InsufficientFundsError } from "@/lib/wallet/ledger";
import { logger } from "@/lib/logger";

export function commissionPct(): number {
    const v = Number(process.env.STAYS_COMMISSION_PCT ?? 10);
    return Number.isFinite(v) && v >= 0 && v <= 50 ? v : 10;
}

export type Quote = {
    productId: string;
    title: string;
    nights: number;
    pricePerNightCents: number;
    totalCents: number;
    currency: "RON";
    available: boolean;
    reason?: string;
    maxGuests: number;
    hostUserId: string | null;
};

/** Calculează prețul și verifică disponibilitatea pentru interval. */
export async function quoteStay(
    productId: string,
    checkIn: string,
    checkOut: string,
    guests: number,
): Promise<Quote | null> {
    const { rows } = await dbQuery<{
        id: string; title: string; price_cents: number | null; status: string; metadata: any;
        vertical_attributes: any;
    }>(
        `SELECT id::text, title, price_cents, status, metadata, vertical_attributes
           FROM marketplace_products
          WHERE id = $1::uuid AND listing_type = 'listing'
            AND (metadata->>'vertical' = 'stays' OR taxonomy_node_slug LIKE 'vacation-rentals%')`,
        [productId],
    );
    const p = rows[0];
    if (!p) return null;

    // Preț: listingurile gazdelor au price_cents; cele vechi au
    // vertical_attributes.price_per_night (lei) — acceptăm ambele.
    const attrPerNight = Number(p.vertical_attributes?.price_per_night);
    const perNightCents =
        p.price_cents ?? (Number.isFinite(attrPerNight) && attrPerNight > 0 ? Math.round(attrPerNight * 100) : 0);

    const nights = Math.round(
        (new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000,
    );
    const maxGuests = Number(p.metadata?.max_guests ?? p.vertical_attributes?.max_guests ?? 2);
    const base: Quote = {
        productId: p.id,
        title: p.title,
        nights,
        pricePerNightCents: perNightCents,
        totalCents: perNightCents * Math.max(0, nights),
        currency: "RON",
        available: false,
        maxGuests,
        hostUserId: p.metadata?.host_user_id ?? null,
    };

    if (p.status !== "active") return { ...base, reason: "Cazarea nu este publicată." };
    if (nights < 1) return { ...base, reason: "Check-out trebuie să fie după check-in." };
    if (perNightCents <= 0) return { ...base, reason: "Cazarea nu are preț configurat." };
    if (guests > maxGuests) return { ...base, reason: `Maxim ${maxGuests} oaspeți.` };

    // Zile marcate indisponibil de gazdă.
    const blocked = await dbQuery<{ n: string }>(
        `SELECT COUNT(*)::text AS n FROM stay_availability
          WHERE product_id = $1::uuid AND is_available = false
            AND day >= $2::date AND day < $3::date`,
        [productId, checkIn, checkOut],
    );
    if (Number(blocked.rows[0]?.n ?? 0) > 0) {
        return { ...base, reason: "Perioada e blocată de gazdă." };
    }

    // Rezervări care se suprapun.
    const overlap = await dbQuery<{ n: string }>(
        `SELECT COUNT(*)::text AS n FROM stay_bookings
          WHERE product_id = $1::uuid AND status IN ('pending','confirmed')
            AND daterange(check_in, check_out) && daterange($2::date, $3::date)`,
        [productId, checkIn, checkOut],
    );
    if (Number(overlap.rows[0]?.n ?? 0) > 0) {
        return { ...base, reason: "Perioada e deja rezervată." };
    }

    // Prețuri speciale pe zile (sezon), dacă gazda le-a setat.
    const overrides = await dbQuery<{ total: string | null }>(
        `SELECT SUM(price_cents_override)::text AS total FROM stay_availability
          WHERE product_id = $1::uuid AND price_cents_override IS NOT NULL
            AND day >= $2::date AND day < $3::date`,
        [productId, checkIn, checkOut],
    );
    const overrideCount = await dbQuery<{ n: string }>(
        `SELECT COUNT(*)::text AS n FROM stay_availability
          WHERE product_id = $1::uuid AND price_cents_override IS NOT NULL
            AND day >= $2::date AND day < $3::date`,
        [productId, checkIn, checkOut],
    );
    const nOv = Number(overrideCount.rows[0]?.n ?? 0);
    const totalCents =
        nOv > 0
            ? Number(overrides.rows[0]?.total ?? 0) + (nights - nOv) * perNightCents
            : perNightCents * nights;

    return { ...base, totalCents, available: true };
}

export type BookResult =
    | { ok: true; bookingId: string }
    | { ok: false; error: string; code?: "unavailable" | "insufficient_funds" };

export async function bookStayWithWallet(input: {
    productId: string;
    userId: string;
    guestName: string;
    guestEmail: string;
    guestPhone?: string;
    checkIn: string;
    checkOut: string;
    guests: number;
}): Promise<BookResult> {
    const q = await quoteStay(input.productId, input.checkIn, input.checkOut, input.guests);
    if (!q) return { ok: false, error: "Cazare inexistentă." };
    if (!q.available) return { ok: false, error: q.reason ?? "Indisponibil", code: "unavailable" };

    // 1. Rezervare pending — exclusion constraint previne cursa între 2 clienți.
    let bookingId: string;
    try {
        const { rows } = await dbQuery<{ id: string }>(
            `INSERT INTO stay_bookings
                (product_id, guest_user_id, guest_name, guest_email, guest_phone,
                 check_in, check_out, guests_count, total_cents, currency, status, payment_status)
             VALUES ($1::uuid,$2::uuid,$3,$4,$5,$6::date,$7::date,$8,$9,'RON','pending','pending')
             RETURNING id::text`,
            [
                input.productId, input.userId, input.guestName, input.guestEmail,
                input.guestPhone ?? null, input.checkIn, input.checkOut, input.guests, q.totalCents,
            ],
        );
        bookingId = rows[0].id;
    } catch (err: any) {
        if (String(err?.code) === "23P01") {
            return { ok: false, error: "Perioada tocmai a fost rezervată de altcineva.", code: "unavailable" };
        }
        throw err;
    }

    // 2. Debit wallet, idempotent pe bookingId.
    try {
        await debitUser({
            userId: input.userId,
            amountCents: q.totalCents,
            refType: "stay_booking",
            refId: bookingId,
            description: `Cazare: ${q.title} (${input.checkIn} → ${input.checkOut})`,
        });
    } catch (err) {
        await dbQuery(`UPDATE stay_bookings SET status='cancelled' WHERE id=$1::uuid`, [bookingId]);
        if (err instanceof InsufficientFundsError) {
            return { ok: false, error: "Fonduri insuficiente în wallet.", code: "insufficient_funds" };
        }
        logger.error({ err, bookingId }, "stay booking: debit failed");
        return { ok: false, error: "Plata a eșuat." };
    }

    // 3. Confirmare + credit gazdă (net de comision).
    await dbQuery(
        `UPDATE stay_bookings SET status='confirmed', payment_status='paid' WHERE id=$1::uuid`,
        [bookingId],
    );

    if (q.hostUserId) {
        const commission = Math.round((q.totalCents * commissionPct()) / 100);
        try {
            await creditUser({
                userId: q.hostUserId,
                amountCents: q.totalCents - commission,
                refType: "stay_payout",
                refId: bookingId,
                description: `Încasare cazare: ${q.title} (comision ${commissionPct()}%)`,
            });
        } catch (err) {
            // Rezervarea rămâne validă; payout-ul se reia manual din admin.
            logger.error({ err, bookingId }, "stay booking: host credit failed");
        }
    }

    logger.info({ bookingId, totalCents: q.totalCents }, "stay booked (wallet)");
    return { ok: true, bookingId };
}
