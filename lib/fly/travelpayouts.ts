/**
 * Travelpayouts (Aviasales Data API) — https://travelpayouts.com
 * Cont afiliat gratuit, token instant. Env: TRAVELPAYOUTS_TOKEN,
 * TRAVELPAYOUTS_MARKER (id-ul de afiliat pentru comision pe redirect).
 *
 * Acoperă low-cost (Ryanair, Wizz) pe care Duffel nu le emite.
 * Model: search prin prices/latest + flight search API; rezervarea se
 * finalizează pe site-ul partenerului prin link afiliat (câștigăm comision),
 * nu emitem noi biletul → createOrder întoarce mesaj explicit, iar UI-ul
 * afișează buton "Rezervă la partener" pentru ofertele acestui provider.
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

const SEARCH_BASE = "https://api.travelpayouts.com";

/** Cursă EUR: API-ul întoarce prețuri în moneda cerută prin `currency`. */
function affiliateLink(params: FlightSearchParams): string {
  const marker = process.env.TRAVELPAYOUTS_MARKER ?? "";
  const d = params.departDate.replaceAll("-", "").slice(4); // MMDD → format aviasales ddmm
  const dd = `${params.departDate.slice(8, 10)}${params.departDate.slice(5, 7)}`;
  const rr = params.returnDate
    ? `${params.returnDate.slice(8, 10)}${params.returnDate.slice(5, 7)}`
    : "";
  void d;
  return `https://www.aviasales.com/search/${params.origin}${dd}${params.destination}${rr}${params.adults}?marker=${marker}`;
}

export const travelpayoutsProvider: FlightProvider = {
  id: "travelpayouts",

  isConfigured() {
    return Boolean(process.env.TRAVELPAYOUTS_TOKEN);
  },

  async search(params: FlightSearchParams): Promise<FlightOffer[]> {
    const currency = (params.currency ?? "EUR").toLowerCase();
    const q = new URLSearchParams({
      origin: params.origin,
      destination: params.destination,
      departure_at: params.departDate,
      currency,
      sorting: "price",
      direct: "false",
      limit: String(params.maxResults ?? 30),
      one_way: params.returnDate ? "false" : "true",
      token: process.env.TRAVELPAYOUTS_TOKEN!,
    });
    if (params.returnDate) q.set("return_at", params.returnDate);

    const res = await fetch(
      `${SEARCH_BASE}/aviasales/v3/prices_for_dates?${q}`,
      { headers: { Accept: "application/json" }, cache: "no-store" },
    );
    if (!res.ok) {
      logger.warn({ status: res.status }, "travelpayouts search failed");
      return [];
    }
    const json = await res.json().catch(() => ({} as any));
    const data: any[] = json?.data ?? [];
    const markup = markupCents();
    const link = affiliateLink(params);

    return data.map((f): FlightOffer => {
      const providerTotalCents = toCents(f.price ?? 0);
      const departAt: string = f.departure_at ?? `${params.departDate}T00:00:00`;
      const durationMin: number | undefined = f.duration ?? undefined;
      const arriveAt = durationMin
        ? new Date(new Date(departAt).getTime() + durationMin * 60000).toISOString()
        : departAt;
      return {
        provider: "travelpayouts",
        offerId: `tp:${f.origin}-${f.destination}-${f.departure_at}-${f.airline}${f.flight_number ?? ""}`,
        providerTotalCents,
        markupCents: markup,
        totalCents: providerTotalCents + markup,
        currency: (json?.currency ?? currency).toUpperCase(),
        slices: [
          {
            origin: f.origin ?? params.origin,
            destination: f.destination ?? params.destination,
            durationMinutes: durationMin,
            segments: [
              {
                origin: f.origin ?? params.origin,
                destination: f.destination ?? params.destination,
                departAt,
                arriveAt,
                carrier: f.airline ?? "",
                flightNumber: String(f.flight_number ?? ""),
                durationMinutes: durationMin,
              },
            ],
          },
        ],
        stops: Number(f.transfers ?? 0),
        carrier: f.airline ?? "",
        baggageIncluded: false,
        expiresAt: null,
        raw: { deepLink: f.link ? `https://www.aviasales.com${f.link}&marker=${process.env.TRAVELPAYOUTS_MARKER ?? ""}` : link },
      };
    });
  },

  async priceCheck(offer: FlightOffer): Promise<PriceCheckResult> {
    // Prețurile Travelpayouts sunt din cache-ul Aviasales (nu garantate).
    // Nu există endpoint de revalidare per ofertă → tratăm oferta ca valabilă,
    // dar plata NU se face la noi (redirect la partener), deci riscul e zero.
    return { ok: true, offer, deltaCents: 0 };
  },

  async createOrder(_input: CreateOrderInput): Promise<CreateOrderResult> {
    return {
      ok: false,
      message:
        "Ofertele low-cost se rezervă la partener prin linkul afiliat — folosește butonul 'Rezervă la partener'.",
    };
  },
};
