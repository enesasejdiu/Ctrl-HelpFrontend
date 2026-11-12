// setup.js – runs before every test file: jest-dom matchers, the MSW mock API, and a clean slate after each test.
import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, beforeEach, vi } from 'vitest'
import { resetCompanyName } from '../settings/companyName'
import { server, session } from './server'

// findBy*/waitFor give up after 3s instead of 1s: still returns as soon as the UI matches, but leaves room
// for debounced search (300ms) + request + render on a slow machine or under coverage instrumentation
configure({ asyncUtilTimeout: 3000 })

// Any request without a handler fails the request loudly instead of hitting the network
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }))
afterAll(() => server.close())

// Fail the test on console.error/warn (act() warnings, React key warnings, MSW unhandled requests…)
let consoleSpies = []
beforeEach(() => {
  consoleSpies = [vi.spyOn(console, 'error'), vi.spyOn(console, 'warn')]
})

afterEach(() => {
  cleanup()
  // Every test loads the company name again (it's shared module state); after cleanup, so nothing re-renders
  resetCompanyName()
  server.resetHandlers()
  server.events.removeAllListeners() // request:start listeners a test added
  session.user = null
  localStorage.clear()
  sessionStorage.clear()
  // Expire every cookie a test set (e.g. tf_csrf)
  for (const cookie of document.cookie.split('; ').filter(Boolean)) {
    document.cookie = `${cookie.split('=')[0]}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`
  }
  vi.useRealTimers()

  const messages = consoleSpies.flatMap((spy) => spy.mock.calls.map((args) => args.map(String).join(' ')))
  vi.restoreAllMocks()
  if (messages.length) {
    throw new Error(`Unexpected console output during the test:\n${messages.join('\n')}`)
  }
})
