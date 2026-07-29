/**
 * ════════════════════════════════════════════════════════════════════════════
 *  SWYPIK — Catalogul universal de verticale
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Sursa UNICĂ de adevăr pentru tot ce se poate vinde pe Swypik.
 * Din acest fișier se generează automat:
 *   • bara de categorii din feed        • acțiunea butonului pe fiecare clip
 *   • paginile de verticală             • filtrele de căutare
 *   • formularele de publicare          • validările API
 *
 * A adăuga o verticală nouă = ~15 linii aici + traduceri. ZERO cod nou.
 *
 * Regula de aur: user-ul NU caută. Feed-ul îi propune. Verticalele sunt
 * doar felul în care organizăm intern oferta și modul de tranzacționare.
 */

/** Cum se cumpără. Determină butonul de acțiune și fluxul de checkout. */
export type TransactionMode =
  | "cart"     // coș + checkout clasic          → „Adaugă în coș”
  | "order"    // comandă live cu livrare        → „Comandă”
  | "booking"  // rezervare pe interval/slot     → „Rezervă”
  | "lead"     // cerere de ofertă / contact     → „Contactează”
  | "ride";    // cursă punct-la-punct           → „Cheamă”

/** Cine are voie să publice în verticală. */
export type PublisherType =
  | "seller"       // magazin online
  | "merchant"     // business local cu program (restaurant, farmacie)
  | "agency"       // agenție (imobiliare, turism)
  | "dealer"       // dealer auto
  | "professional" // PFA / specialist (medic, coafor, meditator)
  | "host"         // gazdă cazare
  | "driver";      // șofer / curier

export interface Vertical {
  /** identificator stabil, folosit în URL: /v/eats */
  id: string;
  /** brand internațional, apare în logo/URL */
  brand: string;
  /** cheie i18n pentru eticheta localizată (verticals.<id>.label) */
  labelKey: string;
  /** emoji folosit în bara de categorii (rapid, fără assets) */
  emoji: string;
  /** culoare de accent — se aplică PESTE tema de bază, nu o înlocuiește */
  accent: string;
  mode: TransactionMode;
  publisher: PublisherType;
  /** rădăcina în taxonomy_nodes */
  taxonomyRoot: string;
  /** are nevoie de locația utilizatorului ca să aibă sens */
  localOnly?: boolean;
  /** conținut restricționat 18+ */
  adultOnly?: boolean;
  /** valul de lansare (1 = live acum) */
  wave: 1 | 2 | 3 | 4 | 5;
  /** grupare pentru navigare */
  group: "shop" | "local" | "property" | "travel" | "services" | "mobility" | "work";
}

export const VERTICAL_CATALOG: Vertical[] = [
  // ─── COMERȚ ───────────────────────────────────────────────────────────────
  { id: "shop",    brand: "Swypik Shop",    labelKey: "shop",    emoji: "🛍️", accent: "#0D0D0D", mode: "cart", publisher: "seller", taxonomyRoot: "shop",    wave: 1, group: "shop" },
  { id: "fashion", brand: "Swypik Fashion", labelKey: "fashion", emoji: "👗", accent: "#DB2777", mode: "cart", publisher: "seller", taxonomyRoot: "fashion", wave: 1, group: "shop" },
  { id: "tech",    brand: "Swypik Tech",    labelKey: "tech",    emoji: "📱", accent: "#0EA5E9", mode: "cart", publisher: "seller", taxonomyRoot: "tech",    wave: 1, group: "shop" },
  { id: "home",    brand: "Swypik Home",    labelKey: "home",    emoji: "🛋️", accent: "#A16207", mode: "cart", publisher: "seller", taxonomyRoot: "home",    wave: 1, group: "shop" },
  { id: "beauty",  brand: "Swypik Beauty",  labelKey: "beauty",  emoji: "💄", accent: "#E11D48", mode: "cart", publisher: "seller", taxonomyRoot: "beauty",  wave: 1, group: "shop" },
  { id: "kids",    brand: "Swypik Kids",    labelKey: "kids",    emoji: "🧸", accent: "#F59E0B", mode: "cart", publisher: "seller", taxonomyRoot: "kids",    wave: 2, group: "shop" },
  { id: "pets",    brand: "Swypik Pets",    labelKey: "pets",    emoji: "🐾", accent: "#65A30D", mode: "cart", publisher: "seller", taxonomyRoot: "pets",    wave: 2, group: "shop" },
  { id: "sports",  brand: "Swypik Sports",  labelKey: "sports",  emoji: "⚽", accent: "#059669", mode: "cart", publisher: "seller", taxonomyRoot: "sports",  wave: 2, group: "shop" },
  { id: "farm",    brand: "Swypik Farm",    labelKey: "farm",    emoji: "🥕", accent: "#4D7C0F", mode: "cart", publisher: "merchant", taxonomyRoot: "farm",  wave: 2, group: "shop", localOnly: true },

  // ─── LIVRARE LOCALĂ ───────────────────────────────────────────────────────
  { id: "eats",    brand: "Swypik Eats",    labelKey: "eats",    emoji: "🍔", accent: "#F97316", mode: "order", publisher: "merchant", taxonomyRoot: "food",     wave: 1, group: "local", localOnly: true },
  { id: "market",  brand: "Swypik Market",  labelKey: "market",  emoji: "🛒", accent: "#16A34A", mode: "order", publisher: "merchant", taxonomyRoot: "grocery",  wave: 3, group: "local", localOnly: true },
  { id: "pharma",  brand: "Swypik Pharma",  labelKey: "pharma",  emoji: "💊", accent: "#0891B2", mode: "order", publisher: "merchant", taxonomyRoot: "pharmacy", wave: 3, group: "local", localOnly: true },
  { id: "flowers", brand: "Swypik Flowers", labelKey: "flowers", emoji: "💐", accent: "#EC4899", mode: "order", publisher: "merchant", taxonomyRoot: "flowers",  wave: 3, group: "local", localOnly: true },
  { id: "drinks",  brand: "Swypik Drinks",  labelKey: "drinks",  emoji: "🍷", accent: "#7E22CE", mode: "order", publisher: "merchant", taxonomyRoot: "drinks",   wave: 4, group: "local", localOnly: true, adultOnly: true },

  // ─── IMOBILIARE & AUTO ────────────────────────────────────────────────────
  { id: "estates", brand: "Swypik Estates", labelKey: "estates", emoji: "🏠", accent: "#2563EB", mode: "lead",    publisher: "agency", taxonomyRoot: "real-estate", wave: 1, group: "property" },
  { id: "auto",    brand: "Swypik Auto",    labelKey: "auto",    emoji: "🚗", accent: "#DC2626", mode: "lead",    publisher: "dealer", taxonomyRoot: "vehicles",    wave: 1, group: "property" },
  { id: "rentals", brand: "Swypik Rentals", labelKey: "rentals", emoji: "🔑", accent: "#7C3AED", mode: "booking", publisher: "agency", taxonomyRoot: "rentals",     wave: 3, group: "property", localOnly: true },

  // ─── TURISM & EXPERIENȚE ──────────────────────────────────────────────────
  { id: "stays",  brand: "Swypik Stays",  labelKey: "stays",  emoji: "🏖️", accent: "#0D9488", mode: "booking", publisher: "host",   taxonomyRoot: "vacation-rentals", wave: 1, group: "travel" },
  { id: "trips",  brand: "Swypik Trips",  labelKey: "trips",  emoji: "🗺️", accent: "#0284C7", mode: "booking", publisher: "agency", taxonomyRoot: "trips",            wave: 2, group: "travel" },
  { id: "events", brand: "Swypik Events", labelKey: "events", emoji: "🎟️", accent: "#9333EA", mode: "booking", publisher: "agency", taxonomyRoot: "events",           wave: 5, group: "travel" },
  { id: "fly",    brand: "Swypik Fly",    labelKey: "fly",    emoji: "✈️", accent: "#1D4ED8", mode: "booking", publisher: "agency", taxonomyRoot: "flights",          wave: 5, group: "travel" },

  // ─── SERVICII ─────────────────────────────────────────────────────────────
  { id: "beautypro", brand: "Swypik Beauty Pro", labelKey: "beautypro", emoji: "💇", accent: "#F472B6", mode: "booking", publisher: "professional", taxonomyRoot: "services/beauty",       wave: 2, group: "services", localOnly: true },
  { id: "health",    brand: "Swypik Health",     labelKey: "health",    emoji: "🩺", accent: "#0EA5E9", mode: "booking", publisher: "professional", taxonomyRoot: "services/health",       wave: 2, group: "services", localOnly: true },
  { id: "fit",       brand: "Swypik Fit",        labelKey: "fit",       emoji: "🏋️", accent: "#EA580C", mode: "booking", publisher: "professional", taxonomyRoot: "services/fitness",      wave: 2, group: "services", localOnly: true },
  { id: "service",   brand: "Swypik Service",    labelKey: "service",   emoji: "🔧", accent: "#64748B", mode: "booking", publisher: "professional", taxonomyRoot: "services/auto-service", wave: 2, group: "services", localOnly: true },
  { id: "pro",       brand: "Swypik Pro",        labelKey: "pro",       emoji: "🛠️", accent: "#B45309", mode: "lead",    publisher: "professional", taxonomyRoot: "services/home-repair",  wave: 1, group: "services", localOnly: true },
  { id: "learn",     brand: "Swypik Learn",      labelKey: "learn",     emoji: "📚", accent: "#4F46E5", mode: "lead",    publisher: "professional", taxonomyRoot: "services/education",    wave: 4, group: "services" },
  { id: "care",      brand: "Swypik Care",       labelKey: "care",      emoji: "🧹", accent: "#0D9488", mode: "lead",    publisher: "professional", taxonomyRoot: "services/care",         wave: 4, group: "services", localOnly: true },
  { id: "biz",       brand: "Swypik Biz",        labelKey: "biz",       emoji: "💼", accent: "#475569", mode: "lead",    publisher: "professional", taxonomyRoot: "services/business",     wave: 4, group: "services" },

  // ─── MOBILITATE ───────────────────────────────────────────────────────────
  { id: "go",   brand: "Swypik Go",   labelKey: "go",   emoji: "🚕", accent: "#16A34A", mode: "ride",  publisher: "driver", taxonomyRoot: "rides",             wave: 5, group: "mobility", localOnly: true },
  { id: "send", brand: "Swypik Send", labelKey: "send", emoji: "📦", accent: "#CA8A04", mode: "order", publisher: "driver", taxonomyRoot: "courier",           wave: 3, group: "mobility", localOnly: true },
  { id: "move", brand: "Swypik Move", labelKey: "move", emoji: "🚚", accent: "#78716C", mode: "lead",  publisher: "professional", taxonomyRoot: "services/transport", wave: 4, group: "mobility" },

  // ─── MUNCĂ ────────────────────────────────────────────────────────────────
  { id: "jobs", brand: "Swypik Jobs", labelKey: "jobs", emoji: "💼", accent: "#1E40AF", mode: "lead", publisher: "seller", taxonomyRoot: "jobs", wave: 4, group: "work" },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

const BY_ID = new Map(VERTICAL_CATALOG.map((v) => [v.id, v]));

export function getVertical(id: string): Vertical | undefined {
  return BY_ID.get(id);
}

/** Verticalele lansate (wave <= currentWave), în ordinea de afișare. */
export function liveVerticals(currentWave = 1): Vertical[] {
  return VERTICAL_CATALOG.filter((v) => v.wave <= currentWave);
}

/** Verticala căreia îi aparține un slug de taxonomie (cel mai specific câștigă). */
export function verticalForTaxonomy(slug: string | null | undefined): Vertical | undefined {
  if (!slug) return undefined;
  let best: Vertical | undefined;
  for (const v of VERTICAL_CATALOG) {
    if (slug === v.taxonomyRoot || slug.startsWith(v.taxonomyRoot + "/")) {
      if (!best || v.taxonomyRoot.length > best.taxonomyRoot.length) best = v;
    }
  }
  return best;
}

/** Cheia i18n a butonului de acțiune pentru un mod de tranzacție. */
export const ACTION_KEY: Record<TransactionMode, string> = {
  cart: "actions.addToCart",
  order: "actions.order",
  booking: "actions.book",
  lead: "actions.contact",
  ride: "actions.call",
};

/** Modurile care necesită checkout cu plată online imediată. */
export const PAID_UPFRONT: TransactionMode[] = ["cart", "order", "booking"];
