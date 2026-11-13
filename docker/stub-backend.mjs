// A stand-in for the backend, for docker/verify.sh and docker/check-csp.mjs: answers GET /api/health, /api/echo with
// what it received (the path, Host, the X-Forwarded-* headers, cookies, and how many body bytes), and everything else
// under /api/ with 401 "Not logged in" (a signed-out visitor), so the nginx proxy and the app can be checked without a
// database. Not part of the image. Run with: node docker/stub-backend.mjs (port 5050)
import http from 'node:http'

http
  .createServer((req, res) => {
    let bytes = 0
    req.on('data', (chunk) => (bytes += chunk.length))
    req.on('end', () => {
      const isHealth = req.url.startsWith('/api/health')
      const isEcho = req.url.startsWith('/api/echo')
      const body = isHealth
        ? { status: 'ok', stub: true }
        : !isEcho
          ? { message: 'Not logged in' }
          : {
              url: req.url,
              method: req.method,
              bytes,
              host: req.headers.host,
              'x-real-ip': req.headers['x-real-ip'],
              'x-forwarded-for': req.headers['x-forwarded-for'],
              'x-forwarded-proto': req.headers['x-forwarded-proto'],
              cookie: req.headers.cookie,
            }
      res.writeHead(isHealth || isEcho ? 200 : 401, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(body))
    })
  })
  .listen(5050, () => console.log('stub backend on :5050'))
