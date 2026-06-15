/**
 * Free-text search query normalization for product search.
 *
 * The Postgres FTS index (search_document) is built with the 'simple' config
 * over UNACCENTED text, so we must:
 *   1. strip diacritics
 *   2. drop Romanian/English stop-words and noise (prices, units, numbers)
 *   3. build a tsquery that ANDs the meaningful keywords (precise), and a
 *      separate OR variant used as a recall fallback.
 *
 * Returns the artefacts needed by buildSearchFilters.
 */

const STOP_WORDS = new Set([
  // Romanian
  "si", "sau", "cu", "fara", "de", "la", "in", "pe", "pentru", "din", "un", "o",
  "unei", "unui", "este", "sunt", "vreau", "caut", "cauta", "imi", "mi", "ma",
  "as", "ai", "are", "am", "vrea", "doresc", "trebuie", "ceva", "niste", "mai",
  "cel", "cea", "cei", "cele", "acest", "acea", "aceasta", "asta", "asa", "foarte",
  "sub", "peste", "pana", "cat", "cati", "cate", "lei", "ron", "eur", "euro", "usd",
  "buget", "bani", "pret", "preturi", "ieftin", "ieftine", "scump", "scumpe",
  "bun", "buna", "bune", "buni", "best", "top", "calitate", "recomanda", "gaseste",
  "arata", "vezi", "da", "nu", "ok", "te", "rog", "multumesc", "cadou", "gift",
  // English
  "and", "or", "with", "without", "for", "the", "a", "an", "of", "in", "on",
  "to", "i", "want", "need", "find", "show", "me", "some", "good", "best", "buy",
  "under", "over", "up", "cheap", "expensive", "price", "budget", "give", "please",
]);

function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\u0219/g, "s").replace(/\u021b/g, "t") // ș ț (precomposed fallbacks)
    .replace(/\u015f/g, "s").replace(/\u0163/g, "t");
}

export type SearchTokens = {
  /** cleaned keyword list (unaccented, lowercased) */
  keywords: string[];
  /** "kw1 & kw2 & kw3" — precise tsquery (empty string if no keywords) */
  andQuery: string;
  /** "kw1 | kw2 | kw3" — recall tsquery (empty string if no keywords) */
  orQuery: string;
  /** ILIKE pattern for the single most significant keyword, e.g. "%laptop%" */
  primaryLike: string;
};

export function extractSearchTokens(raw: string): SearchTokens {
  const cleaned = stripDiacritics(String(raw || "").toLowerCase());

  const candidates = cleaned
    .split(/[^a-z0-9]+/)
    .map((w) => w.trim())
    .filter(Boolean)
    // drop pure numbers (prices, sizes) and very short noise
    .filter((w) => !/^\d+$/.test(w))
    .filter((w) => w.length >= 2)
    .filter((w) => !STOP_WORDS.has(w));

  // de-duplicate while preserving order
  const seen = new Set<string>();
  const keywords: string[] = [];
  for (const w of candidates) {
    if (!seen.has(w)) {
      seen.add(w);
      keywords.push(w);
    }
  }

  // tsquery lexemes must be sanitized; keep alnum only (already split that way)
  const lexemes = keywords.filter((w) => /^[a-z0-9]+$/.test(w));

  return {
    keywords,
    andQuery: lexemes.join(" & "),
    orQuery: lexemes.join(" | "),
    // longest keyword is usually the most specific (e.g. "laptop" over "hp")
    primaryLike: keywords.length
      ? `%${keywords.slice().sort((a, b) => b.length - a.length)[0]}%`
      : "",
  };
}
