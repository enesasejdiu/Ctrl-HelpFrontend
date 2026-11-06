// playwright.config.ts – end-to-end tests in e2e/, against a backend + throwaway test database (never the dev DB).
// Ports and DB settings come from e2e/.env.test. Run with `npm run e2e`.
import { defineConfig, devices } from '@playwright/test'
import { API_URL, FRONTEND_PORT, FRONTEND_URL } from './scripts/e2e-env.mjs'

const CI = !!process.env.CI

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  // One worker: all tests share one database. Tests only assert on data they created themselves (unique names),
  // so raising this mostly works already; for full safety give each worker its own DB + backend port.
  workers: 1,
  fullyParallel: false,
  forbidOnly: CI,
  retries: CI ? 2 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  globalSetup: './e2e/global-setup.ts',

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

  webServer: [
    {
      name: 'backend',
      // Starts the test DB, wipes + migrates + seeds it, then runs the API; stopped (with the DB) after the run
      command: 'node scripts/e2e-backend.mjs start',
      url: `${API_URL}/health`,
      reuseExistingServer: !CI,
      timeout: 120_000,
      stdout: 'pipe',
    },
    {
      name: 'frontend',
      // Its own port (not 5173), so a running dev server — which talks to the dev API — is never reused.
      // VITE_API_URL from the environment takes priority over the value in .env.
      command: `npx vite --port ${FRONTEND_PORT} --strictPort`,
      url: FRONTEND_URL,
      env: { VITE_API_URL: API_URL },
      reuseExistingServer: !CI,
      timeout: 60_000,
    },
  ],
})
