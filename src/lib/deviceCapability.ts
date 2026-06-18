/**
 * Shared low-spec-device heuristic for the interview flow.
 *
 * Used to decide whether to run the heavy bits (3D avatar, full-rate recording,
 * observer frame stream). Keeping ONE definition avoids the bug where the avatar
 * gate and the recording-quality gate disagreed: a real crashing laptop (8 GB /
 * Intel i5-1035G1, 8 threads) was treated as low-spec for the avatar but
 * high-spec for recording, so it recorded at the heavier profile and still
 * crashed.
 *
 * Key constraint: Chrome CAPS `navigator.deviceMemory` at 8, so an 8 GB laptop
 * and a 64 GB workstation both report 8 — RAM alone can't tell weak from strong.
 * We therefore fall back to CPU thread count, and treat anything we can't
 * measure as low-spec (safer: the degraded path is fully functional).
 */
export function isLowSpecDevice(): boolean {
  if (typeof navigator === "undefined") return false; // SSR — re-evaluated on client
  const nav = navigator as Navigator & { deviceMemory?: number; hardwareConcurrency?: number };
  const mem = nav.deviceMemory;
  const cores = nav.hardwareConcurrency;
  if (typeof mem !== "number") return true;   // unmeasurable RAM → assume low-spec
  if (mem <= 4) return true;                   // genuinely small RAM
  if (typeof cores !== "number") return true;  // unmeasurable CPU → assume low-spec
  // deviceMemory caps at 8, so for 8 GB-class machines use cores as the
  // tiebreaker: only 12+ logical processors counts as "strong".
  if (cores < 12) return true;
  return false;
}
