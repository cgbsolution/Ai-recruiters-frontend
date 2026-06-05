/**
 * Candidates created from a parsed resume that had NO extractable email get a
 * synthetic placeholder on the backend (the `email` column is NOT NULL and the
 * list view hides `pending_%@resume.local`, so the parser rewrites it to a
 * stable stub). These are NOT real addresses and must never be shown as such or
 * used as a mailto / interview-invite target.
 *
 * Known synthetic patterns produced by the backend:
 *   - pending_<name>@resume.local        (initial placeholder before parsing)
 *   - no-email-<id>@unknown.local        (resume parsed, but no email found)
 *   - noemail_<name>@pending.local       (resume-database upload)
 */
const PLACEHOLDER_EMAIL_PATTERNS: RegExp[] = [
  /@resume\.local$/i,
  /@unknown\.local$/i,
  /@pending\.local$/i,
  /^no-?email[-_]/i,
  /^pending_/i,
];

/** True if `email` is missing or one of the synthetic backend placeholders. */
export function isPlaceholderEmail(email?: string | null): boolean {
  if (!email) return true;
  return PLACEHOLDER_EMAIL_PATTERNS.some((re) => re.test(email.trim()));
}

/** True if `email` is a real, usable address (safe for mailto / invites). */
export function hasRealEmail(email?: string | null): boolean {
  return !isPlaceholderEmail(email);
}

/** The email to show in the UI — empty string for placeholders. */
export function displayEmail(email?: string | null): string {
  return isPlaceholderEmail(email) ? "" : (email as string);
}
