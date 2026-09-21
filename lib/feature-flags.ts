/**
 * Feature flags pentru MVP freeze.
 * Modulele dezactivate aici raman in cod dar nu mai sunt accesibile public.
 * Reactivare: schimba env var in .env.production si restart container.
 */

function flag(name: string, defaultEnabled: boolean): boolean {
  const v = process.env[name];
  if (v === undefined) return defaultEnabled;
  return v === '1' || v === 'true';
}

export const FEATURES = {
  dm: flag('FEATURE_DM', false),
  pushNotifications: flag('FEATURE_PUSH_NOTIFICATIONS', false),
  stripeConnect: flag('FEATURE_STRIPE_CONNECT', false),
  fulfillment: flag('FEATURE_FULFILLMENT', false),
  returns: flag('FEATURE_RETURNS', false),
  emailMarketing: flag('FEATURE_EMAIL_MARKETING', false),
  seoPages: flag('FEATURE_SEO_PAGES', false),
  aiChatFull: flag('FEATURE_AI_CHAT_FULL', false),
  // killswitch verticala Go (commit 327586fc îl folosea fără să-l declare)
  go: flag('FEATURE_GO', true),
  // Catalog demo de produse "virale" pentru selleri — date de exemplu, nu un
  // feed real de furnizor. OFF până există unul.
  viralCatalog: flag('FEATURE_VIRAL_CATALOG', false),
  // Cutia zilnică (Mystery Drop) — acordă SWYP prin swyp_emission_rules.
  mysteryDrop: flag('FEATURE_MYSTERY_DROP', true),
  // Squad Buy: grupurile se formează, dar NIMIC nu aplică prețul redus la
  // checkout și nu se reține niciun ban — OFF până există integrarea cu plata.
  squadBuy: flag('FEATURE_SQUAD_BUY', false),
  // Swypik Movies — OFF până există primul serial publicat.
  movies: flag('FEATURE_MOVIES', false),
} as const;

export type FeatureName = keyof typeof FEATURES;

export function frozenResponse(feature: FeatureName) {
  return new Response(
    JSON.stringify({
      ok: false,
      error: 'feature_frozen',
      feature,
      message: 'Acest modul este temporar dezactivat pentru MVP.',
    }),
    { status: 410, headers: { 'content-type': 'application/json' } }
  );
}

export function isEnabled(feature: FeatureName): boolean {
  return FEATURES[feature];
}
