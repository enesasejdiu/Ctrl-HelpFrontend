// logger.js – the one place app errors are reported: render crashes caught by the error boundaries, plus uncaught
// errors and unhandled promise rejections (see GlobalErrorListener). Every report goes to the console, and to Sentry
// when it's configured (monitoring.js).
//
// Each report has an event ID in Sentry's format (32 hex characters), made here when the error happens. The fallback
// shows its first 8 characters as the reference a user can quote to support. Sentry stores the report under the full
// ID and tags it with the reference, and the console line names both.
//
// What a report contains: the error's name, message and stack, React's component stack, the route's path (no query
// string, which can hold search text) and the logged-in user's id. Nothing else about the user, no form contents, and
// never request details (an axios error's config would carry headers).
import { sendNotFoundToMonitoring, sendToMonitoring } from './monitoring'

let currentUserId = null

// Set by AuthContext whenever the logged-in user changes (null when logged out)
export function setErrorUser(id) {
  currentUserId = id ?? null
}

// A random 128-bit ID as 32 lowercase hex characters, the format Sentry uses for event IDs
export function newEventId() {
  return crypto.randomUUID().replaceAll('-', '')
}

// What the user sees: the event ID's first 8 characters, e.g. "3FA91C0B", short enough to read out over the phone
export function referenceFor(eventId) {
  return eventId.slice(0, 8).toUpperCase()
}

// A thrown value doesn't have to be an Error (throw 'oops', Promise.reject(undefined), …)
function describe(error) {
  if (error instanceof Error) return { name: error.name, message: error.message, stack: error.stack ?? null }
  return { name: 'NonError', message: typeof error === 'string' ? error : String(error), stack: null }
}

// The console side, swappable (tests spy on it)
export const errorLog = {
  send(entry) {
    console.error(`[TicketFlow] ${entry.kind} (reference ${entry.referenceId}, event ${entry.eventId})`, entry)
  },
}

/**
 * Reports one error and returns its event ID.
 * @param options.error           what was thrown
 * @param options.kind            where it came from: 'render-app', 'render-route', 'chunk-reload', 'window-error', …
 * @param options.componentStack  React's component stack, for render errors
 * @param options.route           the route's path; defaults to the browser's current path
 * @param options.eventId         an ID whose reference is already on screen; a new one otherwise
 */
export function logError({ error, kind, componentStack = null, route, eventId = newEventId() }) {
  const entry = {
    eventId,
    referenceId: referenceFor(eventId),
    kind,
    ...describe(error),
    componentStack,
    route: route ?? window.location.pathname,
    userId: currentUserId,
    time: new Date().toISOString(),
  }
  // Reporting must never cause a second crash
  try {
    errorLog.send(entry)
  } catch {
    // ignore
  }
  try {
    sendToMonitoring(entry, error)
  } catch {
    // ignore
  }
  return eventId
}

// A URL that matched no route. Not an error, so not on the console: only a low-severity event in monitoring, with the
// path (callers pass location.pathname, which has no query string) cut to 200 characters, and no user.
export function logNotFound(path) {
  try {
    sendNotFoundToMonitoring(String(path).slice(0, 200))
  } catch {
    // ignore
  }
}
