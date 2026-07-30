/**
 * Duffel provider — https://duffel.com/docs (API v2).
 * Env: DUFFEL_API_KEY, DUFFEL_API_URL (default https://api.duffel.com).
 *
 * Flux: offer_requests (search) → offers → orders (booking cu pasageri).
 * Prețuri: total_amount este string decimal → convertit în cenți.
 */
import { logger } from "@/lib/logger";
import {
  CreateOrderInput,
  CreateOrderResult,
  FlightOffer,
  FlightProvider,
  FlightSearchParams,
  PriceCheckResult,
  markupCents,
  toCents,
} from "./types";

const BASE = () => process.env.DUFFEL_API_URL || "https://api.duffel.com";

async function duffelFetch<T = any>(
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<{ ok: boolean; status: number; data?: T; errors?: any[] }> {
  const res = await fetch(`${BASE()}${path}`, {
    method: init?.method ?? "GET",
    headers: {
      Authorization: `Bearer ${process.env.DUFFEL_API_KEY}`,
      "Duffel-Version": "v2",
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: init?.body ? JSON.stringify({ data: init.body }) : undefined,
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data: json?.data, errors: json?.errors };
}

function minutesBetween(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000);
}

function mapOffer(o: any): FlightOffer {
  const providerTotalCents = toCents(o.total_amount);
  const markup = markupCents();
  const slices = (o.slices ?? []).map((s: any) => ({
    origin: s.origin?.iata_code ?? "",
    destination: s.destination?.iata_code ?? "",
    durationMinutes: s.segments?.length
      ? minutesBetween(s.segments[0].departing_at, s.segments[s.segments.length - 1].arriving_at)
      : undefined,
    segments: (s.segments ?? []).map((seg: any) => ({
      origin: seg.origin?.iata_code ?? "",
      destination: seg.destination?.iata_code ?? "",
      departAt: seg.departing_at,
      arriveAt: seg.arriving_at,
      carrier: seg.marketing_carrier?.iata_code ?? "",
      carrierName: seg.marketing_carrier?.name,
      flightNumber: seg.marketing_carrier_flight_number,
      durationMinutes: minutesBetween(seg.departing_at, seg.arriving_at),
    })),
  }));
  const stops = Math.max(0, ...slices.map((s: any) => s.segments.length - 1));
  return {
    provider: "duffel",
    offerId: o.id,
    providerTotalCents,
    markupCents: markup,
    totalCents: providerTotalCents + markup,
    currency: o.total_currency ?? "EUR",
    slices,
    stops,
    carrier: o.owner?.iata_code ?? "",
    carrierName: o.owner?.name,
    baggageIncluded: Boolean(
      o.slices?.[0]?.segments?.[0]?.passengers?.[0]?.baggages?.some(
        (b: any) => b.type === "checked" && b.quantity > 0,
      ),
    ),
    expiresAt: o.expires_at ?? null,
    raw: { passengers: o.passengers?.map((p: any) => ({ id: p.id, type: p.type })) },
  };
}

export const duffelProvider: FlightProvider = {
  id: "duffel",

  isConfigured() {
    return Boolean(process.env.DUFFEL_API_KEY);
  },

  async search(params: FlightSearchParams): Promise<FlightOffer[]> {
    const passengers: any[] = [];
    for (let i = 0; i < params.adults; i++) passengers.push({ type: "adult" });
    for (let i = 0; i < (params.children ?? 0); i++) passengers.push({ type: "child" });
    for (let i = 0; i < (params.infants ?? 0); i++) passengers.push({ type: "infant_without_seat" });

    const slices: any[] = [
      { origin: params.origin, destination: params.destination, departure_date: params.departDate },
    ];
    if (params.returnDate) {
      slices.push({
        origin: params.destination,
        destination: params.origin,
        departure_date: params.returnDate,
      });
    }

    const r = await duffelFetch<any>(
      `/air/offer_requests?return_offers=true&supplier_timeout=15000`,
      {
        method: "POST",
        body: {
          slices,
          passengers,
          cabin_class: params.cabin ?? "economy",
          max_connections: 1,
        },
      },
    );
    if (!r.ok || !r.data) {
      logger.warn({ status: r.status, errors: r.errors }, "duffel search failed");
      return [];
    }
    const offers: any[] = r.data.offers ?? [];
    return offers.slice(0, params.maxResults ?? 30).map(mapOffer);
  },

  async priceCheck(offer: FlightOffer): Promise<PriceCheckResult> {
    const r = await duffelFetch<any>(`/air/offers/${encodeURIComponent(offer.offerId)}`);
    if (!r.ok || !r.data) {
      return { ok: false, reason: r.status === 404 ? "expired" : "provider_error" };
    }
    const fresh = mapOffer(r.data);
    if (fresh.expiresAt && new Date(fresh.expiresAt).getTime() < Date.now()) {
      return { ok: false, reason: "expired" };
    }
    const delta = fresh.totalCents - offer.totalCents;
    return { ok: true, offer: fresh, deltaCents: delta, reason: delta !== 0 ? "price_changed" : undefined };
  },

  async createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
    // Duffel cere id-urile pasagerilor din ofertă.
    const offerPassengers: any[] = (input.offer.raw?.passengers as any[]) ?? [];
    const passengers = input.passengers.map((p, i) => ({
      id: offerPassengers[i]?.id,
      title: p.title ?? "mr",
      given_name: p.givenName,
      family_name: p.familyName,
      born_on: p.bornOn,
      gender: p.gender ?? "m",
      email: p.email ?? input.contactEmail,
      phone_number: p.phone ?? input.contactPhone,
    }));

    const r = await duffelFetch<any>(`/air/orders`, {
      method: "POST",
      body: {
        type: "instant",
        selected_offers: [input.offer.offerId],
        passengers,
        payments: [
          {
            type: "balance",
            amount: (input.offer.providerTotalCents / 100).toFixed(2),
            currency: input.offer.currency,
          },
        ],
      },
    });
    if (!r.ok || !r.data) {
      const msg = r.errors?.[0]?.message ?? `duffel order failed (${r.status})`;
      logger.error({ status: r.status, errors: r.errors }, "duffel order failed");
      return { ok: false, message: msg };
    }
    return {
      ok: true,
      providerOrderId: r.data.id,
      bookingRef: r.data.booking_reference,
    };
  },
};
