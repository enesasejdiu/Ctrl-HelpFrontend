// server.js – the MSW mock API used by every test. Default handlers cover requests most pages make;
// a test overrides or adds responses with server.use(...), and setup.js resets them after each test.
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { DEPARTMENTS, buildMeta } from './factories'

// The same base URL the axios client uses (set for tests in vite.config.js)
export const API = import.meta.env.VITE_API_URL

// Who the mock backend thinks is logged in: the stand-in for the httpOnly session cookie, which tests (like the app)
// can't see. renderWithProviders({ user }) sets it; setup.js clears it after each test.
let sessionUser = null
export function setSessionUser(user) {
  sessionUser = user
}
export function getSessionUser() {
  return sessionUser
}

export const handlers = [
  // AuthProvider asks on startup who is logged in: answer with the session's user, or 401
  http.get(`${API}/auth/me`, () =>
    sessionUser ? HttpResponse.json(sessionUser) : HttpResponse.json({ message: 'Not logged in' }, { status: 401 }),
  ),
  // Logout clears the session (the real backend clears the cookies) and answers 204
  http.post(`${API}/auth/logout`, () => {
    sessionUser = null
    return new HttpResponse(null, { status: 204 })
  }),
  http.get(`${API}/meta`, () => HttpResponse.json(buildMeta())),
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
