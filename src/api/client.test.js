// client.test.js – the shared axios client with cookie sessions: it sends credentials, never an Authorization header,
// adds the CSRF header to requests that change something, and reports a session ending (401) or a temporary password.
import { http, HttpResponse } from 'msw'
import { API, server } from '../test/server'
import client, { CSRF_HEADER, PASSWORD_CHANGE_REQUIRED_EVENT, SESSION_EXPIRED_EVENT } from './client'

// Answers every request to /echo with 200 and records its headers
function recordRequests() {
  const requests = []
  server.use(
    http.all(`${API}/echo`, ({ request }) => {
      requests.push({ method: request.method, headers: Object.fromEntries(request.headers) })
      return HttpResponse.json({ ok: true })
    }),
  )
  return requests
}

function listenFor(eventName) {
  const listener = vi.fn()
  window.addEventListener(eventName, listener)
  onTestFinished(() => window.removeEventListener(eventName, listener))
  return listener
}

describe('API client', () => {
  it('sends credentials (the session cookies) with every request', async () => {
    recordRequests()
    expect(client.defaults.withCredentials).toBe(true)

    const { config } = await client.get('/echo')
    expect(config.withCredentials).toBe(true)
  })

  it('never sets an Authorization header, even with an old token left in localStorage', async () => {
    localStorage.setItem('ticketflow.token', 'old-token')
    const requests = recordRequests()

    for (const method of ['get', 'post', 'patch', 'put', 'delete']) await client[method]('/echo')

    expect(requests).toHaveLength(5)
    for (const { headers } of requests) expect(headers).not.toHaveProperty('authorization')
  })

  describe('CSRF header', () => {
    it.each(['post', 'patch', 'put', 'delete'])(
      '%s sends X-CSRF-Token with the tf_csrf cookie value',
      async (method) => {
        document.cookie = 'tf_csrf=abc123'
        const requests = recordRequests()

        await client[method]('/echo')

        expect(requests[0].headers['x-csrf-token']).toBe('abc123')
      },
    )

    it('GET does not need it and does not send it', async () => {
      document.cookie = 'tf_csrf=abc123'
      const requests = recordRequests()

      await client.get('/echo')

      expect(requests[0].headers).not.toHaveProperty('x-csrf-token')
    })

    it('without the cookie (logged out) no header is sent', async () => {
      const requests = recordRequests()
      await client.post('/echo')
      expect(requests[0].headers).not.toHaveProperty('x-csrf-token')
    })

    it('reads the right cookie among others', async () => {
      document.cookie = 'other=1'
      document.cookie = 'tf_csrf=the-value'
      document.cookie = 'tf_csrf_old=wrong'
      const requests = recordRequests()

      await client.post('/echo')

      expect(requests[0].headers[CSRF_HEADER.toLowerCase()]).toBe('the-value')
    })
  })

  describe('errors', () => {
    it('a 401 reports that the session ended', async () => {
      const expired = listenFor(SESSION_EXPIRED_EVENT)
      server.use(http.get(`${API}/tickets`, () => HttpResponse.json({ message: 'Not logged in' }, { status: 401 })))

      await expect(client.get('/tickets')).rejects.toMatchObject({ response: { status: 401 } })
      expect(expired).toHaveBeenCalledTimes(1)
    })

    it.each(['/auth/login', '/auth/change-password', '/auth/logout'])(
      'a 401 from %s does not count as the session ending',
      async (url) => {
        const expired = listenFor(SESSION_EXPIRED_EVENT)
        server.use(
          http.post(`${API}${url}`, () => HttpResponse.json({ message: 'Wrong email or password' }, { status: 401 })),
        )

        await expect(client.post(url, {})).rejects.toMatchObject({ response: { status: 401 } })
        expect(expired).not.toHaveBeenCalled()
      },
    )

    it('a 403 PASSWORD_CHANGE_REQUIRED reports it (not a logout)', async () => {
      const expired = listenFor(SESSION_EXPIRED_EVENT)
      const passwordChange = listenFor(PASSWORD_CHANGE_REQUIRED_EVENT)
      server.use(
        http.get(`${API}/tickets`, () =>
          HttpResponse.json({ message: 'Change your password', code: 'PASSWORD_CHANGE_REQUIRED' }, { status: 403 }),
        ),
      )

      await expect(client.get('/tickets')).rejects.toMatchObject({ response: { status: 403 } })
      expect(passwordChange).toHaveBeenCalledTimes(1)
      expect(expired).not.toHaveBeenCalled()
    })

    it('another 403 (e.g. CSRF_INVALID) is just an error', async () => {
      const expired = listenFor(SESSION_EXPIRED_EVENT)
      const passwordChange = listenFor(PASSWORD_CHANGE_REQUIRED_EVENT)
      server.use(
        http.post(`${API}/tickets`, () =>
          HttpResponse.json({ message: 'Missing or invalid CSRF token.', code: 'CSRF_INVALID' }, { status: 403 }),
        ),
      )

      await expect(client.post('/tickets', {})).rejects.toMatchObject({ response: { status: 403 } })
      expect(passwordChange).not.toHaveBeenCalled()
      expect(expired).not.toHaveBeenCalled()
    })
  })
})
