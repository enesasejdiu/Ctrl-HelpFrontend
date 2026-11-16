// A stand-in for the backend, for docker/verify.sh and docker/check-csp.mjs, so the nginx proxy and the app can be
// checked without a database. Not part of the image. Run with: node docker/stub-backend.mjs (port 5050)
//   GET /api/health          → 200 { status, stub: true }
//   /api/echo                → 200 with what it received (the path, Host, the X-Forwarded-* headers, cookies, how many
//                              body bytes), and a Set-Cookie, to check that cookies come back through nginx
//   /api/does-not-exist...   → 404 JSON, the way the backend answers a route it doesn't have
//   anything else            → 401 "Not logged in" (a signed-out visitor)
import http from 'node:http'

http
  .createServer((req, res) => {
    let bytes = 0
    req.on('data', (chunk) => (bytes += chunk.length))
    req.on('end', () => {
      const send = (status, body, headers = {}) => {
        res.writeHead(status, { 'Content-Type': 'application/json', ...headers })
        res.end(JSON.stringify(body))
      }
      console.log(`${req.method} ${req.url} x-forwarded-for=${req.headers['x-forwarded-for'] ?? '-'} bytes=${bytes}`)
      if (req.url.startsWith('/api/health')) return send(200, { status: 'ok', stub: true })
      if (req.url.startsWith('/api/does-not-exist'))
        return send(404, { message: `Route not found: ${req.method} ${req.url.split('?')[0]}` })
      if (req.url.startsWith('/api/echo'))
        return send(
          200,
          {
            url: req.url,
            method: req.method,
            bytes,
            host: req.headers.host,
            'x-real-ip': req.headers['x-real-ip'],
            'x-forwarded-for': req.headers['x-forwarded-for'],
            'x-forwarded-proto': req.headers['x-forwarded-proto'],
            cookie: req.headers.cookie,
          },
          { 'Set-Cookie': 'tf_stub=1; Path=/; HttpOnly; SameSite=Lax' },
        )
      send(401, { message: 'Not logged in' })
    })
  })
  .listen(5050, () => console.log('stub backend on :5050'))
