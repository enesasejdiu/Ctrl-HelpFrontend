// client.test.js – the axios client and the cookie session: requests send the cookies, every change copies the
// tf_csrf cookie into X-CSRF-Token, reads don't need it, and no token is ever sent or stored.
import { http, HttpResponse } from 'msw'
import { API, server } from '../test/server'
import client, { CSRF_HEADER, readCookie } from './client'

// Answers every method on /echo with the headers it received
function echoHeaders() {
  const seen = []
  const record = ({ request }) => {
    seen.push({
      method: request.method,
      csrf: request.headers.get(CSRF_HEADER),
      auth: request.headers.get('Authorization'),
    })
    return HttpResponse.json({ ok: true })
  }
  server.use(
    http.get(`${API}/echo`, record),
    http.post(`${API}/echo`, record),
    http.patch(`${API}/echo`, record),
    http.put(`${API}/echo`, record),
    http.delete(`${API}/echo`, record),
  )
  return seen
}

describe('API client', () => {
  it('sends the cookies with every request (withCredentials)', () => {
    expect(client.defaults.withCredentials).toBe(true)
  })

  it('copies the tf_csrf cookie into X-CSRF-Token on POST, PATCH, PUT and DELETE', async () => {
    document.cookie = 'tf_csrf=abc123'
    const seen = echoHeaders()

    await client.post('/echo', {})
    await client.patch('/echo', {})
    await client.put('/echo', {})
    await client.delete('/echo')

    expect(seen.map((r) => [r.method, r.csrf])).toEqual([
      ['POST', 'abc123'],
      ['PATCH', 'abc123'],
      ['PUT', 'abc123'],
      ['DELETE', 'abc123'],
    ])
  })

  it('sends no CSRF header on GET', async () => {
    document.cookie = 'tf_csrf=abc123'
    const seen = echoHeaders()
    await client.get('/echo')
    expect(seen).toEqual([{ method: 'GET', csrf: null, auth: null }])
  })

  it('never sends an Authorization header, even if an old token is still in localStorage', async () => {
    localStorage.setItem('ticketflow.token', 'old-token')
    document.cookie = 'tf_csrf=abc123'
    const seen = echoHeaders()
    await client.get('/echo')
    await client.post('/echo', {})
    expect(seen.map((r) => r.auth)).toEqual([null, null])
  })

  it('sends no CSRF header when there is no tf_csrf cookie (the backend then answers 403)', async () => {
    const seen = echoHeaders()
    await client.post('/echo', {})
    expect(seen[0].csrf).toBeNull()
  })

  it('readCookie finds a cookie among several and decodes it', () => {
    document.cookie = 'other=1'
    document.cookie = 'tf_csrf=a%20b'
    expect(readCookie('tf_csrf')).toBe('a b')
    expect(readCookie('missing')).toBeNull()
  })
})
