// playwright.config.ts – end-to-end tests in e2e/, against their own backend, frontend and a throwaway database
// (ticketflow_e2e_<timestamp>_<pid>, created and seeded for this run and dropped afterwards). The real database is
// never touched. Ports and the database name are chosen per run in scripts/e2e-env.mjs. Run with `npm run e2e`.
import { defineConfig, devices } from '@playwright/test'
import { API_PORT, API_URL, FRONTEND_PORT, FRONTEND_URL, PASSWORD_DELIVERY } from './scripts/e2e-env.mjs'

const CI = !!process.env.CI

export default defineConfig({
  testDir: './e2e',
  // The backend runs in one password-delivery mode per run. The default run (email links) runs every spec except
  // temporary-passwords.spec.ts, which needs email off and runs on its own (npm run e2e:temporary-passwords).
  testMatch: PASSWORD_DELIVERY === 'temporary_password' ? '**/temporary-passwords.spec.ts' : '**/*.spec.ts',
  testIgnore: PASSWORD_DELIVERY === 'temporary_password' ? [] : ['**/temporary-passwords.spec.ts'],
  // One worker: all tests share one database. Tests only assert on data they created themselves (unique names),
  // so raising this mostly works already; for full safety give each worker its own DB + backend port.
  workers: 1,
  fullyParallel: false,
  forbidOnly: CI,
  retries: CI ? 2 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  globalSetup: './e2e/global-setup.ts',
  // Drops this run's database, also when tests failed
  globalTeardown: './e2e/global-teardown.ts',

  use: {
    baseURL: FRONTEND_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  ],

  // Both servers are always started fresh for the run, on free ports, and never reused: an already running server
  // (such as a dev server talking to the real database) can't be picked up by mistake.
  webServer: [
    {
      name: 'backend',
      // Creates, migrates and seeds this run's database, then runs the API against it
      command: 'node scripts/e2e-backend.mjs start',
      url: `${API_URL}/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'pipe',
    },
    {
      name: 'frontend',
      // Same setup as development: the page calls /api and the dev server proxies it to this run's backend, so the
      // session cookies are first-party. Environment variables take priority over the values in .env.
      command: `npx vite --port ${FRONTEND_PORT} --strictPort`,
      url: FRONTEND_URL,
      // VITE_SENTRY_DSN is emptied so test runs never report to Sentry, whatever .env says
      env: { VITE_API_URL: '/api', API_PROXY_TARGET: `http://localhost:${API_PORT}`, VITE_SENTRY_DSN: '' },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
})
