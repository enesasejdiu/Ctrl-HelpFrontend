// static-not-found.test.js – a real `vite preview` server over a small fake build: page URLs (deep links) load the app,
// files that exist are served, and missing files get a real 404 instead of index.html.
// Runs in the default jsdom environment like the rest (the shared setup needs it); the preview server is plain Node.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { http, passthrough } from 'msw'
import { preview } from 'vite'
import { server as mockApi } from '../src/test/server'
import { looksLikeFile, staticNotFound } from './static-not-found'

const INDEX = '<!doctype html><html><body><div id="root"></div></body></html>'
let root, previewServer, base

beforeAll(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ticketflow-preview-'))
  const dist = path.join(root, 'dist')
  fs.mkdirSync(path.join(dist, 'assets'), { recursive: true })
  fs.writeFileSync(path.join(dist, 'index.html'), INDEX)
  fs.writeFileSync(path.join(dist, 'assets', 'index-1a2b.js'), 'console.log("app")')
  fs.writeFileSync(path.join(dist, 'favicon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>')
  fs.writeFileSync(path.join(root, 'secret.txt'), 'outside dist')

  previewServer = await preview({
    root,
    configFile: false,
    logLevel: 'silent',
    plugins: [staticNotFound()],
    preview: { port: 0, host: '127.0.0.1' },
  })
  base = `http://127.0.0.1:${previewServer.httpServer.address().port}`
})

afterAll(async () => {
  await previewServer?.close()
  fs.rmSync(root, { recursive: true, force: true })
})

// The test setup's mock API rejects unknown requests; these go to the real preview server
beforeEach(() => mockApi.use(http.all(`${base}/*`, () => passthrough())))

async function get(pathname, accept = '*/*') {
  const response = await fetch(base + pathname, { headers: { Accept: accept } })
  return { status: response.status, type: response.headers.get('content-type') ?? '', body: await response.text() }
}

it.each(['/tickets/42', '/admin/users', '/admin/usres', '/tickets/new?x=1'])(
  'page URL %s loads the app',
  async (url) => {
    const { status, body } = await get(url, 'text/html')
    expect(status).toBe(200)
    expect(body).toBe(INDEX)
  },
)

it('files in the build are served', async () => {
  expect(await get('/assets/index-1a2b.js')).toMatchObject({ status: 200, body: 'console.log("app")' })
  expect((await get('/favicon.svg')).type).toContain('image/svg+xml')
})

it.each([
  ['a code file', '/assets/index-OLD.js'],
  ['a stylesheet', '/assets/index-OLD.css'],
  ['an image', '/missing.png'],
  ['a browser asking for HTML', '/assets/index-OLD.js', 'text/html'],
  ['a file outside dist/', '/../secret.txt'],
  ['an escaped way out of dist/', '/assets/..%2f..%2fsecret.txt'],
])('a missing file (%s) is a real 404, not index.html', async (_case, url, accept) => {
  const { status, type, body } = await get(url, accept)
  expect(status).toBe(404)
  expect(type).toContain('text/plain')
  expect(body).not.toContain('<html')
})

it('looksLikeFile tells files from page URLs', () => {
  expect(['/assets/app.js', '/logo.PNG', '/robots.txt'].map(looksLikeFile)).toEqual([true, true, true])
  expect(['/', '/tickets/42', '/admin/users/', '/a.b/c'].map(looksLikeFile)).toEqual([false, false, false, false])
})
