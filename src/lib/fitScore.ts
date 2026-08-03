/**
 * Fit-score level bands — the ONE definition the whole frontend uses.
 *
 * These must stay in lockstep with `FIT_LEVEL_HIGH` / `FIT_LEVEL_MEDIUM` in
 * `app/services/smart_scoring_service.py`. They previously disagreed: the
 * backend stored anything below 50 as "low" while the badge rendered anything
 * from 40 up as "MEDIUM FIT", so a 45% candidate was saved one way and shown
 * another — the same candidate read as a different tier depending on the screen
 * you were looking at.
 */
export const FIT_LEVEL_HIGH = 70;
export const FIT_LEVEL_MEDIUM = 50;

export type FitLevelName = "high" | "medium" | "low";

/** Map a 0-100 fit percentage onto high/medium/low. */
export function fitLevelForPercentage(pct: number): FitLevelName {
  if (pct >= FIT_LEVEL_HIGH) return "high";
  if (pct >= FIT_LEVEL_MEDIUM) return "medium";
  return "low";
}
