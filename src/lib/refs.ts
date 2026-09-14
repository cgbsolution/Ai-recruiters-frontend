/**
 * Opaque object references used in admin page URLs instead of sequential ids
 * (e.g. /evaluation/Xk3Lq9vB2mP7aQ1zRt rather than /evaluation/48). The backend
 * mints them (app/refs.py) and returns them as `ref` on jobs, candidates and
 * organizations; API endpoints accept them wherever an id is expected.
 */
const REF_RE = /^[0-9A-Za-z]{18}$/;

/** True when `value` looks like a ref. Pages show "not found" for anything else. */
export function isRef(value: unknown): value is string {
  return typeof value === "string" && REF_RE.test(value);
}
