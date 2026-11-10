// setup.js – runs before every test file: jest-dom matchers, the MSW mock API, and a clean slate after each test.
import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, beforeEach, vi } from 'vitest'
import { server, setSessionUser } from './server'

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
  server.resetHandlers()
  setSessionUser(null)
  localStorage.clear()
  // Cookies a test set (tf_csrf): expire them all
  for (const part of document.cookie.split(';')) {
    const name = part.split('=')[0].trim()
    if (name) document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`
  }
  vi.useRealTimers()

  const messages = consoleSpies.flatMap((spy) => spy.mock.calls.map((args) => args.map(String).join(' ')))
  vi.restoreAllMocks()
  if (messages.length) {
    throw new Error(`Unexpected console output during the test:\n${messages.join('\n')}`)
  }
})
