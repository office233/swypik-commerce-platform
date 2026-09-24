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
  // OFF by default — explicit opt-in via NEXT_PUBLIC_FEATURE_X=1 at build time,
  // mirroring the server-side default in lib/feature-flags.ts.
  movies: flag(process.env.NEXT_PUBLIC_FEATURE_MOVIES, false),
  music: flag(process.env.NEXT_PUBLIC_FEATURE_MUSIC, false),
  news: flag(process.env.NEXT_PUBLIC_FEATURE_NEWS, false),
  gaming: flag(process.env.NEXT_PUBLIC_FEATURE_GAMING, false),
  crypto: flag(process.env.NEXT_PUBLIC_FEATURE_CRYPTO, false),
  messenger: flag(process.env.NEXT_PUBLIC_FEATURE_MESSENGER, false),
} as const;

export type ClientFeatureName = keyof typeof CLIENT_FEATURES;

export function isEnabledClient(feature: ClientFeatureName): boolean {
  return CLIENT_FEATURES[feature];
}
