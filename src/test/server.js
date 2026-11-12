// server.js – the MSW mock API used by every test. Default handlers cover requests most pages make;
// a test overrides or adds responses with server.use(...), and setup.js resets them after each test.
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { DEPARTMENTS, buildMeta } from './factories'

// The same base URL the axios client uses (set for tests in vite.config.js)
export const API = import.meta.env.VITE_API_URL

// Stands in for the backend's cookie session: who the browser's session cookie belongs to (null = no session).
// seedSession() in render.jsx sets it; setup.js clears it after each test.
export const session = { user: null }

export const handlers = [
  // AuthProvider asks who is logged in on startup: whoever the mock session belongs to, otherwise 401
  http.get(`${API}/auth/me`, () =>
    session.user ? HttpResponse.json(session.user) : HttpResponse.json({ message: 'Not logged in' }, { status: 401 }),
  ),
  // Logging out ends the mock session, like the backend clearing the cookies
  http.post(`${API}/auth/logout`, () => {
    session.user = null
    return new HttpResponse(null, { status: 204 })
  }),
  http.get(`${API}/meta`, () => HttpResponse.json(buildMeta())),
  // The company name next to the logo: none set, so "TicketFlow" shows (tests of the name override this)
  http.get(`${API}/settings/public`, () => HttpResponse.json({ company_name: '' })),
  // The sign-in page asks whether email is set up ("Forgot password?"); tests override it to test it hidden
  http.get(`${API}/auth/config`, () => HttpResponse.json({ email_enabled: true })),
  http.get(`${API}/departments`, () => HttpResponse.json(DEPARTMENTS)),
]

export const server = setupServer(...handlers)

// A promise the test resolves by hand, for holding a mocked request "in flight"
export function deferred() {
  let resolve
  const promise = new Promise((r) => {
    resolve = r
  })
  return { promise, resolve }
}
