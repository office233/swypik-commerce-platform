/**
 * Client-safe feature flags for MVP freeze.
 * Mirrors lib/feature-flags.ts but uses NEXT_PUBLIC_* env vars baked at build time.
 * Defaults match the server flags (false during freeze). To enable a flag in the
 * client bundle, set the corresponding NEXT_PUBLIC_FEATURE_* env var at build time
 * (docker-compose.prod.yml → build args → ARG/ENV) AND the matching server
 * FEATURE_* env var.
 *
 * IMPORTANT: Next inlinează în bundle-ul de browser DOAR accesările literale
 * `process.env.NEXT_PUBLIC_X`. O căutare cu numele variabilei calculat la
 * runtime rămâne `undefined` pe client indiferent de env — bug care a ținut
 * Movies și Music ascunse din meniu (2026-09-22). Aici se citește doar literal.
 */

function flag(value: string | undefined, defaultEnabled: boolean): boolean {
  if (value === undefined || value === "") return defaultEnabled;
  return value === '1' || value === 'true';
}

export const CLIENT_FEATURES = {
  dm: flag(process.env.NEXT_PUBLIC_FEATURE_DM, false),
  pushNotifications: flag(process.env.NEXT_PUBLIC_FEATURE_PUSH_NOTIFICATIONS, false),
  stripeConnect: flag(process.env.NEXT_PUBLIC_FEATURE_STRIPE_CONNECT, false),
  returns: flag(process.env.NEXT_PUBLIC_FEATURE_RETURNS, false),
  // Virtual Try-On: componenta e doar UI de previzualizare (fără AR real) — OFF.
  tryOn: flag(process.env.NEXT_PUBLIC_FEATURE_TRY_ON, false),
  // Trebuie setat ÎMPREUNĂ cu FEATURE_SQUAD_BUY (server) — vezi lib/feature-flags.ts.
  squadBuy: flag(process.env.NEXT_PUBLIC_FEATURE_SQUAD_BUY, false),
  movies: flag(process.env.NEXT_PUBLIC_FEATURE_MOVIES, true),
  music: flag(process.env.NEXT_PUBLIC_FEATURE_MUSIC, true),
  news: flag(process.env.NEXT_PUBLIC_FEATURE_NEWS, true),
  gaming: flag(process.env.NEXT_PUBLIC_FEATURE_GAMING, true),
  crypto: flag(process.env.NEXT_PUBLIC_FEATURE_CRYPTO, true),
  messenger: flag(process.env.NEXT_PUBLIC_FEATURE_MESSENGER, true),
} as const;

export type ClientFeatureName = keyof typeof CLIENT_FEATURES;

export function isEnabledClient(feature: ClientFeatureName): boolean {
  return CLIENT_FEATURES[feature];
}
