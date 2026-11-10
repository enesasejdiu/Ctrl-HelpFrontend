// logger.test.js – what an error report contains, and what it must leave out.
import { errorLog, logError, newEventId, referenceFor, setErrorUser } from './logger'

describe('logError', () => {
  let send
  beforeEach(() => {
    send = vi.spyOn(errorLog, 'send').mockImplementation(() => {})
  })
  afterEach(() => setErrorUser(null))

  it("event IDs are in Sentry's format (32 hex characters) and differ each time; the reference is the first 8", () => {
    const ids = new Set(Array.from({ length: 50 }, newEventId))
    expect(ids.size).toBe(50)
    for (const id of ids) expect(id).toMatch(/^[0-9a-f]{32}$/)
    expect(referenceFor('3fa91c0b0123456789abcdef01234567')).toBe('3FA91C0B')
  })

  it('sends the error, component stack, route, user id, event ID and reference, and returns the event ID', () => {
    setErrorUser(7)
    const error = new TypeError('boom')
    const id = logError({ error, kind: 'render-route', componentStack: '\n    at Page', route: '/tickets/3' })
    expect(send).toHaveBeenCalledWith({
      eventId: id,
      referenceId: referenceFor(id),
      kind: 'render-route',
      name: 'TypeError',
      message: 'boom',
      stack: error.stack,
      componentStack: '\n    at Page',
      route: '/tickets/3',
      userId: 7,
      time: expect.any(String),
    })
  })

  it('keeps an event ID it is given (the one whose reference is already on screen)', () => {
    const eventId = 'abcd1234abcd1234abcd1234abcd1234'
    expect(logError({ error: new Error('x'), kind: 'render-app', eventId })).toBe(eventId)
    expect(send.mock.calls[0][0]).toMatchObject({ eventId, referenceId: 'ABCD1234' })
  })

  it("the route defaults to the browser's path, without the query string (it can hold search text)", () => {
    window.history.pushState({}, '', '/admin/users?q=jane%40example.com')
    logError({ error: new Error('x'), kind: 'window-error' })
    expect(send.mock.calls[0][0].route).toBe('/admin/users')
    window.history.pushState({}, '', '/')
  })

  it("takes only the name, message and stack, never the rest of the error (e.g. an axios error's request config)", () => {
    const error = Object.assign(new Error('Request failed with status code 500'), {
      config: { headers: { 'X-CSRF-Token': 'secret-csrf' }, data: '{"password":"hunter2"}' },
    })
    logError({ error, kind: 'unhandled-rejection' })
    expect(JSON.stringify(send.mock.calls[0][0])).not.toMatch(/secret-csrf|hunter2/)
  })

  it('copes with values that are not Errors', () => {
    logError({ error: 'just a string', kind: 'window-error' })
    logError({ error: undefined, kind: 'unhandled-rejection' })
    expect(send.mock.calls.map(([entry]) => [entry.name, entry.message, entry.stack])).toEqual([
      ['NonError', 'just a string', null],
      ['NonError', 'undefined', null],
    ])
  })

  it('a failing log sink does not throw', () => {
    send.mockImplementation(() => {
      throw new Error('sink down')
    })
    expect(() => logError({ error: new Error('x'), kind: 'render-app' })).not.toThrow()
  })

  it('by default writes to console.error, naming the reference and the event ID', () => {
    send.mockRestore()
    const consoleError = vi.mocked(console.error).mockImplementation(() => {})
    const id = logError({ error: new Error('x'), kind: 'render-app' })
    expect(consoleError).toHaveBeenCalledWith(
      `[TicketFlow] render-app (reference ${referenceFor(id)}, event ${id})`,
      expect.objectContaining({ eventId: id }),
    )
    consoleError.mockClear() // expected output; the test setup fails a test on any console output
  })
})
