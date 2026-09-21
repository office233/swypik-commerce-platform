/** Reguli de produs pentru Swypik Ads — un singur loc, importat de rută și de UI. */
export const AD_DAILY_BUDGET_MIN_RON = 10;
export const AD_DAILY_BUDGET_MAX_RON = 10_000;
export const AD_DAILY_BUDGET_DEFAULT_RON = 20;
export const AD_TYPES = ["boost_reel", "mystery_drop", "flash_sale"] as const;
export type AdType = (typeof AD_TYPES)[number];
export const AD_TARGET_ALL_RO = "all_ro";
