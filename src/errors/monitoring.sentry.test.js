// monitoring.sentry.test.js – the real Sentry SDK: the event it builds really has our event ID (the one whose first 8
// characters the user sees), the reference tag and only the user's id. An event processor records each event and drops
// it, so nothing is ever sent.
import * as Sentry from '@sentry/react'
import { errorLog, logError, referenceFor, setErrorUser } from './logger'
import { initMonitoring } from './monitoring'

let events = []

beforeAll(async () => {
  expect(await initMonitoring({ VITE_SENTRY_DSN: 'https://public@o0.ingest.sentry.io/0', MODE: 'test' })).toBe(true)
  Sentry.addEventProcessor((event) => {
    events.push(event)
    return null // dropped: never sent
  })
})
afterAll(() => Sentry.close())
beforeEach(() => {
  events = []
  vi.spyOn(errorLog, 'send').mockImplementation(() => {})
})

it('the Sentry event has our event ID, the reference tag, the user id and the component stack', async () => {
  setErrorUser(7)
  const eventId = logError({ error: new TypeError('boom'), kind: 'render-route', componentStack: '\n    at Page' })
  setErrorUser(null)

  await vi.waitFor(() => expect(events).toHaveLength(1))
  const [event] = events
  expect(event.event_id).toBe(eventId)
  expect(event.tags).toMatchObject({ reference: referenceFor(eventId), kind: 'render-route' })
  expect(event.user).toEqual({ id: '7' })
  expect(event.contexts.react).toEqual({ componentStack: '\n    at Page' })
  expect(event.exception.values[0]).toMatchObject({ type: 'TypeError', value: 'boom' })
  expect(event.breadcrumbs ?? []).toEqual([])
})

it('the user from one report does not stick to the next', async () => {
  setErrorUser(7)
  logError({ error: new Error('first'), kind: 'render-app' })
  setErrorUser(null)
  logError({ error: new Error('second'), kind: 'render-app' })
  await vi.waitFor(() => expect(events).toHaveLength(2))
  // Sentry represents "no user" as an empty object
  expect(events.map((event) => event.user ?? {})).toEqual([{ id: '7' }, {}])
})
