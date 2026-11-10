// static-not-found.js – Vite plugin for `vite preview`: a request for a file that isn't in the build (dist/) gets a
// real 404 instead of index.html.
//
// Why: the app is a single-page app, so every page URL (/tickets/42, /admin/users, a mistyped one) must load
// index.html, and the app decides what to show. But a missing *file* answered with index.html, e.g. a code file from
// an older deploy, is parsed as JavaScript and fails with a confusing error instead of a plain 404, and the
// chunk-reload guard (src/errors/chunkReload.js) can't recognise it as a failed download.
//
// "A file" means the last path segment has an extension (/assets/index-1a2b.js, /favicon.svg, /missing.png). No app
// route has one. Production hosting needs the same rule; README.md ("Hosting") has an nginx example.
import fs from 'node:fs'
import path from 'node:path'

// True for paths whose last segment has a file extension, like /assets/app.js or /logo.png
export function looksLikeFile(pathname) {
  return /\.[a-z0-9]+$/i.test(pathname.split('/').pop() ?? '')
}

export function staticNotFound() {
  let outDir

  function notFound(res) {
    res.statusCode = 404
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.setHeader('Cache-Control', 'no-store')
    res.end('Not found')
  }

  return {
    name: 'static-not-found',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir)
    },
    // Registered directly (not returned), so it runs before Vite's own preview middleware: the static files, the
    // /api proxy and the index.html fallback
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') return next()
        let pathname
        try {
          pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname)
        } catch {
          return notFound(res) // a malformed escape can't name a file in dist/
        }
        if (pathname.startsWith('/api/') || !looksLikeFile(pathname)) return next()

        const file = path.join(outDir, pathname)
        // Only files inside dist/ ("/assets/../../secret.txt" is just missing)
        if (!file.startsWith(outDir + path.sep)) return notFound(res)
        if (fs.existsSync(file) && fs.statSync(file).isFile()) return next()
        return notFound(res)
      })
    },
  }
}
