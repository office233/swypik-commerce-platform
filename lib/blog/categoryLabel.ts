/**
 * Map RO category names (stored in DB) → translation keys.
 * Falls back to the raw DB string if no mapping exists.
 */
export const CATEGORY_KEY_MAP: Record<string, string> = {
  "Casă & Birou": "casaBirou",
  "Modă": "moda",
  "Tehnologie": "tehnologie",
  "Igienă dentară": "igienaDentara",
  "Beauty": "beauty",
  "Fitness": "fitness",
  "Cadouri": "cadouri",
  "Animale": "animale",
  "Tech": "tech",
};

export function translateBlogCategory(
  raw: string | null | undefined,
  t: (key: string) => string,
): string {
  if (!raw) return "";
  const key = CATEGORY_KEY_MAP[raw];
  if (!key) return raw;
  try {
    return t(key);
  } catch {
    return raw;
  }
}
