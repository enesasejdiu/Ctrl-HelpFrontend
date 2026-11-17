// deployed-env.mjs – npm run e2e:deployed: the suite against an app that is already deployed and DISPOSABLE, e.g. the
// backend's local staging stack (Ctrl-HelpBackend: deploy/staging-up.sh, docs/staging-check.md). Unlike npm run
// e2e:staging (a shared server: its own accounts, cleanup, local-only specs left out), this runs the full suite with the
// seed accounts, so the stack must have been seeded for it and is changed by it. Never a real installation.
//   E2E_BASE_URL     the app's address, e.g. https://ticketflow.localhost:8443
//   E2E_MAILPIT_URL  the stack's Mailpit test inbox (default http://127.0.0.1:8025): the tests read emails there
// Hosts that look like production are refused, like npm run e2e:staging does.
const PRODUCTION_WORDS = /(^|[.-])(prod|production|live|www)([.-]|$)/i

function baseUrl(raw) {
  if (!raw) throw new Error('E2E_BASE_URL is not set (e.g. https://ticketflow.localhost:8443)')
  let url
  try {
    url = new URL(raw)
  } catch {
    throw new Error(`E2E_BASE_URL is not a URL: ${raw}`)
  }
  if (PRODUCTION_WORDS.test(url.hostname)) throw new Error(`Refusing ${url.hostname}: it looks like production`)
  return url.origin
}

export const FRONTEND_URL = baseUrl(process.env.E2E_BASE_URL)
export const API_URL = `${FRONTEND_URL}/api`
export const MAILPIT_URL = (process.env.E2E_MAILPIT_URL || 'http://127.0.0.1:8025').replace(/\/+$/, '')
