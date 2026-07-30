/**
 * Swypik Fly — tipuri comune pentru toți furnizorii (Duffel, Kiwi Tequila).
 * Orice provider nou trebuie doar să implementeze `FlightProvider`.
 */

export type CabinClass = "economy" | "premium_economy" | "business" | "first";

export type FlightSearchParams = {
  origin: string; // IATA (ex: OTP)
  destination: string; // IATA (ex: BCN)
  departDate: string; // YYYY-MM-DD
  returnDate?: string | null;
  adults: number;
  children?: number;
  infants?: number;
  cabin?: CabinClass;
  currency?: string;
  maxResults?: number;
};

export type FlightSegment = {
  origin: string;
  destination: string;
  departAt: string; // ISO
  arriveAt: string; // ISO
  carrier: string; // IATA airline
  carrierName?: string;
  flightNumber?: string;
  durationMinutes?: number;
};

export type FlightSlice = {
  origin: string;
  destination: string;
  durationMinutes?: number;
  segments: FlightSegment[];
};

export type FlightOffer = {
  provider: ProviderId;
  offerId: string;
  /** Cost real la furnizor, în cenți. */
  providerTotalCents: number;
  /** Markup Swypik aplicat (cenți). */
  markupCents: number;
  /** Ce plătește clientul (cenți). */
  totalCents: number;
  currency: string;
  slices: FlightSlice[];
  /** Numărul de escale pe cel mai lung slice. */
  stops: number;
  carrier: string;
  carrierName?: string;
  baggageIncluded?: boolean;
  expiresAt?: string | null;
  /** Payload brut necesar la booking (deep link Kiwi, passenger ids Duffel). */
  raw?: Record<string, unknown>;
};

export type PriceCheckResult = {
  ok: boolean;
  /** Oferta revalidată (poate avea preț diferit). */
  offer?: FlightOffer;
  /** Diferența față de prețul afișat inițial (poate fi negativă). */
  deltaCents?: number;
  reason?: "unavailable" | "expired" | "price_changed" | "provider_error";
  message?: string;
};

export type PassengerInput = {
  type: "adult" | "child" | "infant_without_seat";
  title?: "mr" | "ms" | "mrs" | "miss";
  givenName: string;
  familyName: string;
  bornOn: string; // YYYY-MM-DD
  gender?: "m" | "f";
  email?: string;
  phone?: string;
};

export type CreateOrderInput = {
  offer: FlightOffer;
  passengers: PassengerInput[];
  contactEmail: string;
  contactPhone: string;
};

export type CreateOrderResult = {
  ok: boolean;
  providerOrderId?: string;
  bookingRef?: string; // PNR
  message?: string;
};

export type ProviderId = "duffel" | "kiwi" | "travelpayouts";

export interface FlightProvider {
  readonly id: ProviderId;
  isConfigured(): boolean;
  search(params: FlightSearchParams): Promise<FlightOffer[]>;
  priceCheck(offer: FlightOffer): Promise<PriceCheckResult>;
  createOrder(input: CreateOrderInput): Promise<CreateOrderResult>;
}

/** Markup fix Swypik pe bilet (cenți). Vezi FLY_MARKUP_CENTS. */
export function markupCents(): number {
  const v = Number(process.env.FLY_MARKUP_CENTS ?? 200);
  return Number.isFinite(v) && v >= 0 ? Math.round(v) : 200;
}

/** Suma decimală a providerului ("123.45") → cenți. */
export function toCents(amount: string | number): number {
  return Math.round(Number(amount) * 100);
}
