// playwright.deployed.config.ts – the full e2e suite against a DISPOSABLE deployed stack: npm run e2e:deployed, e.g.
// E2E_BASE_URL=https://ticketflow.localhost:8443 (the backend's local staging stack: deploy/staging-up.sh).
// For a shared staging server use npm run e2e:staging instead (its own accounts, cleanup, local-only specs left out).
//
// - No servers are started and nothing is dropped. The stack must be seeded first (the seed accounts log in) and is
//   changed by the run. Emails are read from its Mailpit inbox (E2E_MAILPIT_URL, default http://127.0.0.1:8025).
// - The stack's own certificate is accepted (ignoreHTTPSErrors): a local stack uses Caddy's local CA.
// - Chromium and Firefox, one worker, no retries. Production's limits apply (20 failed logins per address per
//   15 minutes): restart the stack's API between runs, and run the lockout tests on their own (README).
// - Skipped there, with the reason: the dev-only error pages and "the lock runs out" (15 minutes in production).
//   temporary-passwords.spec.ts needs a backend with email off: not part of this run.
import { defineConfig, devices } from '@playwright/test'
import { FRONTEND_URL } from './scripts/deployed-env.mjs'

// The workers inherit this: e2e/support/target.ts then uses deployed-env.mjs
process.env.E2E_TARGET = 'deployed'

export default defineConfig({
  testDir: './e2e',
  testIgnore: ['**/temporary-passwords.spec.ts'],
  workers: 1,
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  outputDir: 'test-results/deployed',
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report-deployed' }]],
  globalSetup: './e2e/global-setup.deployed.ts',
  use: {
    baseURL: FRONTEND_URL,
    ignoreHTTPSErrors: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  ],
})
