/**
 * Client-safe feature flags for MVP freeze.
 * Mirrors lib/feature-flags.ts but uses NEXT_PUBLIC_* env vars baked at build time.
 * Defaults match the server flags (false during freeze). To enable a flag in the
 * client bundle, set the corresponding NEXT_PUBLIC_FEATURE_* env var at build time
 * AND the matching server FEATURE_* env var.
 */

function flag(name: string, defaultEnabled: boolean): boolean {
  const v = process.env[name];
  if (v === undefined) return defaultEnabled;
  return v === '1' || v === 'true';
}

export const CLIENT_FEATURES = {
  dm: flag('NEXT_PUBLIC_FEATURE_DM', false),
  pushNotifications: flag('NEXT_PUBLIC_FEATURE_PUSH_NOTIFICATIONS', false),
  stripeConnect: flag('NEXT_PUBLIC_FEATURE_STRIPE_CONNECT', false),
  returns: flag('NEXT_PUBLIC_FEATURE_RETURNS', false),
  piAuth: flag('NEXT_PUBLIC_FEATURE_PI_AUTH', true),
  piSandbox: flag('NEXT_PUBLIC_PI_SANDBOX', false),
} as const;

export type ClientFeatureName = keyof typeof CLIENT_FEATURES;

export function isEnabledClient(feature: ClientFeatureName): boolean {
  return CLIENT_FEATURES[feature];
}
