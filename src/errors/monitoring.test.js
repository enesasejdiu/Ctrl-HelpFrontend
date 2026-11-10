// monitoring.test.js – Sentry is loaded only with a DSN, with privacy-safe options; reports go to it under the event ID
// the user sees the start of; anything identifying is scrubbed. The SDK is mocked here (monitoring.sentry.test.js runs
// the real one).
const sentry = vi.hoisted(() => ({
  init: vi.fn(),
  withScope: vi.fn(),
  captureException: vi.fn(),
  dedupeIntegration: vi.fn(),
  linkedErrorsIntegration: vi.fn(),
}))
vi.mock('@sentry/react', () => sentry)

const DSN = 'https://public@o0.ingest.sentry.io/0'
let scope, monitoring, logger

beforeEach(async () => {
  vi.clearAllMocks()
  scope = { setUser: vi.fn(), setTag: vi.fn(), setContext: vi.fn() }
  sentry.withScope.mockImplementation((callback) => callback(scope))
  sentry.dedupeIntegration.mockReturnValue('dedupe')
  sentry.linkedErrorsIntegration.mockReturnValue('linkedErrors')
  // Fresh module state (loaded SDK, queue) for every test
  vi.resetModules()
  monitoring = await import('./monitoring')
  logger = await import('./logger')
  vi.spyOn(logger.errorLog, 'send').mockImplementation(() => {})
})

it('without a DSN, nothing is loaded or sent', async () => {
  expect(await monitoring.initMonitoring({ MODE: 'production' })).toBe(false)
  logger.logError({ error: new Error('x'), kind: 'render-app' })
  expect(sentry.init).not.toHaveBeenCalled()
  expect(sentry.captureException).not.toHaveBeenCalled()
})

it('with a DSN, starts Sentry without default PII, automatic capture or breadcrumbs', async () => {
  const env = { VITE_SENTRY_DSN: DSN, VITE_SENTRY_RELEASE: 'abc123', MODE: 'production' }
  expect(await monitoring.initMonitoring(env)).toBe(true)
  expect(sentry.init).toHaveBeenCalledWith({
    dsn: DSN,
    environment: 'production',
    release: 'abc123',
    sendDefaultPii: false,
    defaultIntegrations: false,
    integrations: ['dedupe', 'linkedErrors'],
    beforeSend: monitoring.scrubEvent,
  })
})

it('VITE_SENTRY_ENVIRONMENT names the environment', async () => {
  await monitoring.initMonitoring({ VITE_SENTRY_DSN: DSN, VITE_SENTRY_ENVIRONMENT: 'staging', MODE: 'production' })
  expect(sentry.init).toHaveBeenCalledWith(expect.objectContaining({ environment: 'staging' }))
})

it('sends a report under its event ID, tagged with the reference, kind and route, with the user id only', async () => {
  await monitoring.initMonitoring({ VITE_SENTRY_DSN: DSN })
  logger.setErrorUser(7)
  const error = new Error('boom')
  const eventId = logger.logError({ error, kind: 'render-route', componentStack: '\n    at Page', route: '/tickets/3' })

  expect(sentry.captureException).toHaveBeenCalledWith(error, { event_id: eventId })
  expect(scope.setUser).toHaveBeenCalledWith({ id: '7' })
  expect(scope.setTag.mock.calls).toEqual([
    ['reference', logger.referenceFor(eventId)],
    ['kind', 'render-route'],
    ['route', '/tickets/3'],
  ])
  expect(scope.setContext).toHaveBeenCalledWith('react', { componentStack: '\n    at Page' })
  logger.setErrorUser(null)
})

it('logged out: no user on the event', async () => {
  await monitoring.initMonitoring({ VITE_SENTRY_DSN: DSN })
  logger.logError({ error: new Error('x'), kind: 'window-error' })
  expect(scope.setUser).toHaveBeenCalledWith(null)
})

it('reports made while the SDK is still loading are sent once it is ready', async () => {
  const ready = monitoring.initMonitoring({ VITE_SENTRY_DSN: DSN })
  const eventId = logger.logError({ error: new Error('early'), kind: 'render-app' })
  expect(sentry.captureException).not.toHaveBeenCalled()
  await ready
  expect(sentry.captureException).toHaveBeenCalledWith(expect.objectContaining({ message: 'early' }), {
    event_id: eventId,
  })
})

it('a thrown non-Error is sent as an Error with that message (so it still has a stack)', async () => {
  await monitoring.initMonitoring({ VITE_SENTRY_DSN: DSN })
  logger.logError({ error: 'just a string', kind: 'unhandled-rejection' })
  const [exception] = sentry.captureException.mock.calls[0]
  expect(exception).toBeInstanceOf(Error)
  expect(exception.message).toBe('just a string')
})

it('if Sentry fails to start, reports stay console-only and nothing piles up', async () => {
  sentry.init.mockImplementationOnce(() => {
    throw new Error('blocked')
  })
  expect(await monitoring.initMonitoring({ VITE_SENTRY_DSN: DSN })).toBe(false)
  logger.logError({ error: new Error('x'), kind: 'render-app' })
  expect(sentry.captureException).not.toHaveBeenCalled()
  expect(logger.errorLog.send).toHaveBeenCalledTimes(1)
})

it('a failing Sentry call never breaks the app', async () => {
  await monitoring.initMonitoring({ VITE_SENTRY_DSN: DSN })
  sentry.withScope.mockImplementation(() => {
    throw new Error('sdk bug')
  })
  expect(() => logger.logError({ error: new Error('x'), kind: 'render-app' })).not.toThrow()
})

it('a URL that matches no route: an "info" message with the path, and no user', async () => {
  sentry.captureMessage = vi.fn()
  await monitoring.initMonitoring({ VITE_SENTRY_DSN: DSN })
  logger.setErrorUser(7)
  logger.logNotFound('/admin/usres')
  logger.setErrorUser(null)
  expect(sentry.captureMessage).toHaveBeenCalledWith('Page not found', 'info')
  expect(scope.setUser).toHaveBeenCalledWith(null)
  expect(scope.setTag.mock.calls).toEqual([
    ['kind', 'not-found'],
    ['route', '/admin/usres'],
  ])
  expect(sentry.captureException).not.toHaveBeenCalled()
  expect(logger.errorLog.send).not.toHaveBeenCalled() // not an error: nothing on the console
})

it('not-found paths are cut to 200 characters', async () => {
  sentry.captureMessage = vi.fn()
  await monitoring.initMonitoring({ VITE_SENTRY_DSN: DSN })
  logger.logNotFound(`/${'a'.repeat(500)}`)
  expect(scope.setTag).toHaveBeenCalledWith('route', `/${'a'.repeat(199)}`)
})

describe('scrubEvent', () => {
  it('drops query strings, headers, cookies, request data, breadcrumbs and extra, and keeps only the user id', () => {
    const event = monitoring.scrubEvent({
      event_id: 'e1',
      request: {
        url: 'https://app.example/admin/users?q=jane%40example.com#top',
        headers: { Cookie: 'tf_session=secret', 'User-Agent': 'x' },
        cookies: { tf_session: 'secret' },
        data: '{"password":"hunter2"}',
      },
      user: { id: '7', email: 'jane@example.com', ip_address: '10.0.0.1' },
      breadcrumbs: [{ message: 'typed jane@example.com' }],
      extra: { form: { password: 'hunter2' } },
      exception: {
        values: [{ stacktrace: { frames: [{ filename: 'https://app.example/assets/a.js?token=secret' }] } }],
      },
    })
    expect(event).toEqual({
      event_id: 'e1',
      request: { url: 'https://app.example/admin/users' },
      user: { id: '7' },
      exception: { values: [{ stacktrace: { frames: [{ filename: 'https://app.example/assets/a.js' }] } }] },
    })
  })

  it('a user without an id is removed', () => {
    expect(monitoring.scrubEvent({ user: { ip_address: '10.0.0.1' } }).user).toBeUndefined()
  })
})
