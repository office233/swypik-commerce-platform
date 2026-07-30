/**
 * Scopes disponibile pentru aplicațiile terțe (App Store / OAuth2).
 */
export const APP_SCOPES = [
  "read_products",
  "write_products",
  "read_orders",
  "write_orders",
  "read_analytics",
] as const;

export type AppScope = (typeof APP_SCOPES)[number];

export const SCOPE_DESCRIPTIONS: Record<AppScope, string> = {
  read_products: "Citește catalogul de produse al magazinului",
  write_products: "Creează și modifică produse",
  read_orders: "Citește comenzile magazinului",
  write_orders: "Actualizează statusul comenzilor",
  read_analytics: "Citește statistici și rapoarte de vânzări",
};

export function isValidScope(s: string): s is AppScope {
  return (APP_SCOPES as readonly string[]).includes(s);
}

/** Filtrează o listă arbitrară la scopes valide, fără duplicate. */
export function sanitizeScopes(scopes: string[]): AppScope[] {
  return [...new Set(scopes.filter(isValidScope))];
}
