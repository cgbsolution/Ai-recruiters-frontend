/**
 * "Is the user still here?" — the signal the admin session's idle timeout
 * runs on.
 *
 * A session ends only after SESSION_IDLE_MS with no activity at all. Activity
 * is any input in ANY open tab (shared through localStorage, so an idle second
 * tab cannot sign out the tab someone is working in), plus long jobs that hold
 * the session open — a bulk resume upload keeps going while the user just
 * watches its progress bar.
 *
 * Mirrors the backend's SESSION_TIMEOUT_MINUTES (24 h): the token is renewed
 * while there is activity (AuthContext → POST /auth/refresh) and simply
 * expires once there has been none for that long.
 */

export const SESSION_IDLE_MS = 24 * 60 * 60 * 1000;

const LAST_ACTIVITY_KEY = "auth_last_activity";
// localStorage is shared by every tab; writing it on each mouse move is waste.
const WRITE_THROTTLE_MS = 30_000;

let lastActivity = Date.now();
let lastWrite = 0;
let holds = 0;

function writeShared(now: number, force = false): void {
  if (!force && now - lastWrite < WRITE_THROTTLE_MS) return;
  lastWrite = now;
  try {
    localStorage.setItem(LAST_ACTIVITY_KEY, String(now));
  } catch {
    // storage unavailable (private mode) — this tab's own clock still works
  }
}

export function markActivity(force = false): void {
  const now = Date.now();
  lastActivity = now;
  writeShared(now, force);
}

/** Most recent activity in any tab, in epoch ms. A held session counts as active now. */
export function lastActivityAt(): number {
  if (holds > 0) markActivity();
  let shared = 0;
  try {
    shared = parseInt(localStorage.getItem(LAST_ACTIVITY_KEY) || "0", 10) || 0;
  } catch {
    // ignore
  }
  return Math.max(lastActivity, shared);
}

/**
 * Keep the session alive while a long job runs (e.g. a bulk upload that takes
 * hours). Call the returned function when the job ends.
 */
export function holdSessionAlive(): () => void {
  holds += 1;
  markActivity(true);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holds = Math.max(0, holds - 1);
    markActivity(true);
  };
}

/** Listen for user input on this page; returns the cleanup. */
export function trackUserActivity(): () => void {
  const events = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart", "scroll", "focus"];
  const onActivity = () => markActivity();
  const onVisibility = () => {
    if (document.visibilityState === "visible") markActivity();
  };
  // capture: scrolls inside panels and tables don't bubble to window
  events.forEach((e) => window.addEventListener(e, onActivity, { passive: true, capture: true }));
  document.addEventListener("visibilitychange", onVisibility);
  return () => {
    events.forEach((e) => window.removeEventListener(e, onActivity, { capture: true }));
    document.removeEventListener("visibilitychange", onVisibility);
  };
}
