/**
 * Sightengine AI content moderation adapter — STUB.
 *
 * Sightengine is used to auto-score every newly uploaded post for adult
 * content categories AND red-flag categories (minors, weapons, gore,
 * non-consensual indicators). The score+flags are recorded in
 * `adult.moderation_queue` and surfaced to human reviewers.
 *
 * If env is missing we DO NOT auto-approve — every post stays in
 * `pending_moderation` for human review. Failing closed is the rule.
 */

export interface ModerationVerdict {
  score: number;            // 0..1 overall NSFW confidence
  flags: Record<string, number>;
  raw: unknown;
  /** True iff a red-flag category fired. Forces auto-block. */
  hardBlock: boolean;
}

export function sightengineConfigured(): boolean {
  return Boolean(process.env.SIGHTENGINE_API_USER && process.env.SIGHTENGINE_API_SECRET);
}

export async function moderateImage(_imageUrl: string): Promise<ModerationVerdict | null> {
  if (!sightengineConfigured()) return null;
  throw new Error("Sightengine adapter not wired — replace this stub.");
}

export async function moderateVideo(_videoUrl: string): Promise<ModerationVerdict | null> {
  if (!sightengineConfigured()) return null;
  throw new Error("Sightengine adapter not wired — replace this stub.");
}
