// legacySession.js – removes the session that older versions of the app kept in localStorage.
// Before cookie sessions, the token and user were saved under these keys. They are no longer read or written; this
// only deletes leftovers once on startup, so an old token doesn't linger in the browser.
// TODO: remove this file (and its call in AuthContext.jsx) after a release or two, once old sessions have expired.

// The only file allowed to touch web storage for auth keys; src/test/no-token-storage.test.js checks that
export const LEGACY_SESSION_KEYS = ['ticketflow.token', 'ticketflow.user']

export function removeLegacySession() {
  try {
    for (const key of LEGACY_SESSION_KEYS) localStorage.removeItem(key)
  } catch {
    // Storage can be unavailable (blocked site data); then there's nothing to clean up either
  }
}
