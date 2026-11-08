// vite.config.js – Vite build/dev-server configuration, plus the Vitest test setup.
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/ and https://vitest.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
  test: {
    // Only the unit/component tests in src/; Playwright owns e2e/*.spec.ts
    include: ['src/**/*.test.{js,jsx}'],
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
      exclude: [
        '**/*.config.*',
        'src/test/**',
        '**/*.{test,spec}.{js,jsx}',
        'src/main.jsx',
      ],
    },
  },
})
