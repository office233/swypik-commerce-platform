/**
 * Amadeus Self-Service provider — https://developers.amadeus.com
 * Cont gratuit, chei instant. Env: AMADEUS_CLIENT_ID, AMADEUS_CLIENT_SECRET,
 * AMADEUS_ENV=test|production (test = https://test.api.amadeus.com).
 *
 * Search: Flight Offers Search v2. Price check: Flight Offers Price.
 * Booking: Flight Create Orders (cere activare separată în producție —
 * până atunci createOrder întoarce mesaj explicit, ca la Kiwi).
 * OAuth2 client_credentials, token cache-uit în memorie (~30 min).
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

const BASE = () =>
  (process.env.AMADEUS_ENV ?? "test") === "production"
    ? "https://api.amadeus.com"
    : "https://test.api.amadeus.com";

let tokenCache: { token: string; expiresAt: number } | null = null;

async function getToken(): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.token;
  const res = await fetch(`${BASE()}/v1/security/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: process.env.AMADEUS_CLIENT_ID!,
      client_secret: process.env.AMADEUS_CLIENT_SECRET!,
    }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`amadeus auth failed (${res.status})`);
  const json = await res.json();
  tokenCache = { token: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return tokenCache.token;
}

async function amadeusFetch<T = any>(
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<{ ok: boolean; status: number; data?: T; dictionaries?: any; errors?: any[] }> {
  const token = await getToken();
  const res = await fetch(`${BASE()}${path}`, {
    method: init?.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data: json?.data, dictionaries: json?.dictionaries, errors: json?.errors };
}

/** ISO 8601 duration "PT2H30M" → minute. */
function isoDurToMin(d?: string): number | undefined {
  if (!d) return undefined;
  const m = /PT(?:(\d+)H)?(?:(\d+)M)?/.exec(d);
  if (!m) return undefined;
  return Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0);
}

function mapOffer(o: any, carriers: Record<string, string> = {}): FlightOffer {
  const providerTotalCents = toCents(o.price?.grandTotal ?? o.price?.total ?? 0);
  const markup = markupCents();
  const slices = (o.itineraries ?? []).map((it: any) => {
    const segs = it.segments ?? [];
    return {
      origin: segs[0]?.departure?.iataCode ?? "",
      destination: segs[segs.length - 1]?.arrival?.iataCode ?? "",
      durationMinutes: isoDurToMin(it.duration),
      segments: segs.map((s: any) => ({
        origin: s.departure?.iataCode ?? "",
        destination: s.arrival?.iataCode ?? "",
        departAt: s.departure?.at,
        arriveAt: s.arrival?.at,
        carrier: s.carrierCode ?? "",
        carrierName: carriers[s.carrierCode],
        flightNumber: s.number,
        durationMinutes: isoDurToMin(s.duration),
      })),
    };
  });
  const mainCarrier = o.validatingAirlineCodes?.[0] ?? slices[0]?.segments[0]?.carrier ?? "";
  return {
    provider: "amadeus",
    offerId: o.id,
    providerTotalCents,
    markupCents: markup,
    totalCents: providerTotalCents + markup,
    currency: o.price?.currency ?? "EUR",
    slices,
    stops: Math.max(0, ...slices.map((s: any) => s.segments.length - 1)),
    carrier: mainCarrier,
    carrierName: carriers[mainCarrier],
    baggageIncluded: Boolean(
      o.travelerPricings?.[0]?.fareDetailsBySegment?.[0]?.includedCheckedBags?.quantity > 0,
    ),
    expiresAt: o.lastTicketingDate ?? null,
    // Payload-ul complet e necesar la Flight Offers Price / Create Orders.
    raw: { flightOffer: o },
  };
}

export const amadeusProvider: FlightProvider = {
  id: "amadeus",

  isConfigured() {
    return Boolean(process.env.AMADEUS_CLIENT_ID && process.env.AMADEUS_CLIENT_SECRET);
  },

  async search(params: FlightSearchParams): Promise<FlightOffer[]> {
    const q = new URLSearchParams({
      originLocationCode: params.origin,
      destinationLocationCode: params.destination,
      departureDate: params.departDate,
      adults: String(params.adults),
      currencyCode: params.currency ?? "EUR",
      max: String(params.maxResults ?? 30),
      travelClass: (params.cabin ?? "economy").toUpperCase(),
    });
    if (params.returnDate) q.set("returnDate", params.returnDate);
    if (params.children) q.set("children", String(params.children));
    if (params.infants) q.set("infants", String(params.infants));

    const r = await amadeusFetch<any[]>(`/v2/shopping/flight-offers?${q}`);
    if (!r.ok || !r.data) {
      logger.warn({ status: r.status, errors: r.errors }, "amadeus search failed");
      return [];
    }
    const carriers = r.dictionaries?.carriers ?? {};
    return r.data.map((o) => mapOffer(o, carriers));
  },

  async priceCheck(offer: FlightOffer): Promise<PriceCheckResult> {
    const flightOffer = offer.raw?.flightOffer;
    if (!flightOffer) return { ok: false, reason: "expired" };
    const r = await amadeusFetch<any>(`/v1/shopping/flight-offers/pricing`, {
      method: "POST",
      body: { data: { type: "flight-offers-pricing", flightOffers: [flightOffer] } },
    });
    if (!r.ok || !r.data) {
      return { ok: false, reason: r.status === 400 || r.status === 404 ? "unavailable" : "provider_error" };
    }
    const priced = (r.data as any).flightOffers?.[0];
    if (!priced) return { ok: false, reason: "unavailable" };
    const fresh = mapOffer(priced);
    const delta = fresh.totalCents - offer.totalCents;
    return { ok: true, offer: fresh, deltaCents: delta, reason: delta !== 0 ? "price_changed" : undefined };
  },

  async createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
    const flightOffer = input.offer.raw?.flightOffer;
    if (!flightOffer) return { ok: false, message: "ofertă amadeus invalidă" };

    const travelers = input.passengers.map((p, i) => ({
      id: String(i + 1),
      dateOfBirth: p.bornOn,
      name: { firstName: p.givenName.toUpperCase(), lastName: p.familyName.toUpperCase() },
      gender: p.gender === "f" ? "FEMALE" : "MALE",
      contact: {
        emailAddress: p.email ?? input.contactEmail,
        phones: [{ deviceType: "MOBILE", countryCallingCode: "40", number: (p.phone ?? input.contactPhone).replace(/\D/g, "") }],
      },
    }));

    const r = await amadeusFetch<any>(`/v1/booking/flight-orders`, {
      method: "POST",
      body: { data: { type: "flight-order", flightOffers: [flightOffer], travelers } },
    });
    if (!r.ok || !r.data) {
      const msg = r.errors?.[0]?.detail ?? `amadeus order failed (${r.status})`;
      logger.error({ status: r.status, errors: r.errors }, "amadeus order failed");
      return { ok: false, message: msg };
    }
    const d = r.data as any;
    return {
      ok: true,
      providerOrderId: d.id,
      bookingRef: d.associatedRecords?.[0]?.reference,
    };
  },
};
