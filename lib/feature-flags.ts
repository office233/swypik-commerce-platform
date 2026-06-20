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
  // Transactional email (order/shipping/refund confirmations, seller alerts).
  // MUST default ON: these are legally-expected receipts a buyer gets after
  // paying, NOT marketing. They were previously (incorrectly) gated behind
  // emailMarketing, so a paying customer received nothing. Separate flag so
  // ops can still kill-switch if Resend has an incident, without re-enabling
  // marketing blasts.
  transactionalEmail: flag('FEATURE_TRANSACTIONAL_EMAIL', true),
  seoPages: flag('FEATURE_SEO_PAGES', false),
  aiChatFull: flag('FEATURE_AI_CHAT_FULL', false),
  piAuth: flag('FEATURE_PI_AUTH', true),
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
