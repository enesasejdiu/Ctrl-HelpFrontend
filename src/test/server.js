// server.js – the MSW mock API used by every test. Default handlers cover requests most pages make;
// a test overrides or adds responses with server.use(...), and setup.js resets them after each test.
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { USER_KEY } from '../api/client'
import { DEPARTMENTS, buildMeta } from './factories'

// The same base URL the axios client uses (set for tests in vite.config.js)
export const API = import.meta.env.VITE_API_URL

export const handlers = [
  // AuthProvider refreshes the saved profile on load: answer with whoever is logged in
  http.get(`${API}/auth/me`, () => {
    try {
      const user = JSON.parse(localStorage.getItem(USER_KEY))
      if (user) return HttpResponse.json(user)
    } catch {
      // corrupted saved user → treated as an invalid session below
    }
    return HttpResponse.json({ message: 'Please log in' }, { status: 401 })
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
