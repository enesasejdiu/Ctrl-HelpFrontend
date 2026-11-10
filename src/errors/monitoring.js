// monitoring.js – sends error reports to Sentry, when VITE_SENTRY_DSN is set at build time. Without it nothing is loaded
// or sent, and reports only go to the console (logger.js).
//
// The SDK is downloaded after the app starts, so it doesn't slow the first page. The event ID is made by logger.js
// when the error happens, so the fallback can show its reference straight away. Sentry receives the report under that
// same ID, plus a "reference" tag (the 8 characters on screen), so support can search for reference:3FA91C0B.
// Reports from before the SDK has loaded wait in a short queue.
// URLs that match no route are sent too, as "info" events with the path only (sendNotFoundToMonitoring).
//
// What Sentry gets is only what logError() sends: the error with its stack, the component stack, the route path, the
// kind and reference tags, and the user's id. sendDefaultPii is off and no integrations that collect anything on their
// own are loaded: no breadcrumbs (they would record URLs with search text, console output and clicks), no request
// headers or cookies, no automatic capture (the boundaries and GlobalErrorListener already report), no tracing or
// replay. scrubEvent() strips anything else before an event leaves the browser.

const MAX_QUEUED = 20

let sentry = null // the loaded SDK
let enabled = false // a DSN is configured and loading hasn't failed
let queue = [] // jobs waiting for the SDK: (Sentry) => void

/**
 * Starts Sentry if a DSN is configured. Resolves to true once it's running, false if it's off or failed to load.
 * @param env  Vite's import.meta.env (a parameter so tests can pass their own)
 */
export async function initMonitoring(env = import.meta.env) {
  const dsn = env.VITE_SENTRY_DSN
  if (!dsn || enabled) return Boolean(sentry)
  enabled = true
  try {
    const Sentry = await import('@sentry/react')
    Sentry.init({
      dsn,
      environment: env.VITE_SENTRY_ENVIRONMENT || env.MODE,
      release: env.VITE_SENTRY_RELEASE || undefined,
      sendDefaultPii: false,
      defaultIntegrations: false,
      integrations: [Sentry.dedupeIntegration(), Sentry.linkedErrorsIntegration()],
      beforeSend: scrubEvent,
    })
    sentry = Sentry
    for (const job of queue.splice(0)) run(job)
    return true
  } catch {
    // e.g. the SDK's file failed to download: stay with console logging
    enabled = false
    queue = []
    return false
  }
}

// Runs a job now if the SDK is ready, later if it's still loading, never if monitoring is off
function whenReady(job) {
  if (!enabled) return
  if (sentry) run(job)
  else if (queue.length < MAX_QUEUED) queue.push(job)
}

function run(job) {
  try {
    job(sentry)
  } catch {
    // A failing SDK call must never break the app
  }
}

// Called by logger.js for every error report
export function sendToMonitoring(entry, error) {
  whenReady((sentry) => capture(sentry, entry, error))
}

// Called by logger.js for a URL that matches no route: an "info" event with the path only (no query string, no user)
export function sendNotFoundToMonitoring(path) {
  whenReady((sentry) =>
    sentry.withScope((scope) => {
      scope.setUser(null)
      scope.setTag('kind', 'not-found')
      scope.setTag('route', path)
      sentry.captureMessage('Page not found', 'info')
    }),
  )
}

function capture(sentry, entry, error) {
  sentry.withScope((scope) => {
    scope.setUser(entry.userId == null ? null : { id: String(entry.userId) })
    scope.setTag('reference', entry.referenceId)
    scope.setTag('kind', entry.kind)
    scope.setTag('route', entry.route)
    if (entry.componentStack) scope.setContext('react', { componentStack: entry.componentStack })
    // A thrown non-Error (a string, undefined…) still gets a stack this way
    const exception = error instanceof Error ? error : new Error(entry.message)
    sentry.captureException(exception, { event_id: entry.eventId })
  })
}

const withoutQuery = (url) => (typeof url === 'string' ? url.split(/[?#]/)[0] : url)

// Last check before an event is sent: page URLs lose their query string and hash, no headers, cookies or request
// data, and the user is reduced to their id
export function scrubEvent(event) {
  if (event.request) event.request = { url: withoutQuery(event.request.url) }
  if (event.user) event.user = event.user.id ? { id: event.user.id } : undefined
  delete event.breadcrumbs
  delete event.extra
  for (const exception of event.exception?.values ?? []) {
    for (const frame of exception.stacktrace?.frames ?? []) {
      if (frame.filename) frame.filename = withoutQuery(frame.filename)
      if (frame.abs_path) frame.abs_path = withoutQuery(frame.abs_path)
    }
  }
  return event
}
