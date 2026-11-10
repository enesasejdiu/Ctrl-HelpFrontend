// vite.config.js – Vite build/dev-server configuration, plus the Vitest test setup.
import react from '@vitejs/plugin-react'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'
import { staticNotFound } from './scripts/static-not-found.js'

// https://vite.dev/config/ and https://vitest.dev/config/
export default defineConfig(({ mode }) => {
  // API_PROXY_TARGET has no VITE_ prefix, so it never ends up in the browser bundle. An environment variable wins
  // over the value in .env (the e2e run uses that to point at its own backend).
  const env = loadEnv(mode, process.cwd(), '')
  // The dev (and preview) server forwards /api to the backend, so the page and the API share one origin: the session
  // cookies are first-party and the page can read tf_csrf for the CSRF header. Use it with VITE_API_URL=/api.
  const proxy = { '/api': { target: env.API_PROXY_TARGET || 'http://localhost:5050' } }

  return {
    // staticNotFound: `vite preview` answers a missing file (e.g. /assets/old.js) with a 404 instead of index.html
    plugins: [react(), staticNotFound()],
    server: {
      port: 5173,
      proxy,
    },
    preview: { proxy },
    test: {
      // Only the unit/component tests in src/; Playwright owns e2e/*.spec.ts
      include: ['src/**/*.test.{js,jsx}', 'scripts/**/*.test.js'],
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test/setup.js'],
      css: true,
      // The default 5s was too tight on a busy machine (e.g. with the dev server rebuilding): a slow but correct test
      // that types into several fields could time out. A genuinely stuck test still fails, just later.
      testTimeout: 15000,
      // Fixed API URL for tests so they don't depend on a local .env; MSW mocks it. Same origin as the
      // jsdom page, so requests don't trigger CORS preflights (the backend's CORS is not what these tests cover).
      environmentOptions: { jsdom: { url: 'http://localhost:5173/' } },
      env: { VITE_API_URL: 'http://localhost:5173/api' },
      coverage: {
        provider: 'v8',
        reporter: ['text', 'html'],
        include: ['src/**/*.{js,jsx}'],
        exclude: ['**/*.config.*', 'src/test/**', '**/*.{test,spec}.{js,jsx}', 'src/main.jsx'],
      },
    },
  }
})
