// playwright.staging.config.ts – the e2e suite against the shared STAGING server: npm run e2e:staging.
// scripts/staging-env.mjs refuses to start unless STAGING_URL is on the staging allowlist and the staging admin's
// login is in the environment. No server is started and no database is touched: tests use the deployed app and make
// their own data through its API (e2e-<runId>-…), and global-teardown.staging.ts cleans it up as far as the API allows.
//
// Careful with a shared server: one worker (the lockout and rate limits count per IP address, for everyone behind it),
// Chromium only, and no retries, so a flaky test shows up as a failure instead of being hidden. Traces, screenshots
// and video are kept for every failure; the report goes to playwright-report-staging/.
import { defineConfig, devices } from '@playwright/test'
import { FRONTEND_URL } from './scripts/staging-env.mjs'

// The workers inherit this: e2e/support/target.ts then uses staging-env.mjs, never the local e2e-env.mjs
process.env.E2E_TARGET = 'staging'

// Spec files that can only run against their own local backend, with the reason. They're not even loaded here (some
// read the local run's settings when loaded); each also says @local-only at its top. List: npm run e2e:staging -- --list
export const LOCAL_ONLY: Record<string, string> = {
  'forced-password-change.spec.ts': "reads the set-password emails from the local run's mail folder",
  'forgot-password.spec.ts': "reads the reset emails from the local run's mail folder",
  'hr-flow.spec.ts': "reads the set-password emails from the local run's mail folder",
  'temporary-passwords.spec.ts': 'needs the backend started with email off, in a run of its own',
  'lockout.spec.ts':
    "needs the test-only LOCKOUT_MINUTES=1, and its wrong passwords count against staging's per-IP login limit for everyone",
  'pagination.spec.ts': 'guarded to a throwaway local database; makes 60 tickets that would stay on staging',
  'settings.spec.ts': "changes shared settings everyone on staging sees (company name, a priority's target hours)",
}

export default defineConfig({
  testDir: './e2e',
  testIgnore: Object.keys(LOCAL_ONLY).map((file) => `**/${file}`),
  grepInvert: /@local-only/,
  workers: 1,
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  outputDir: 'test-results/staging',
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report-staging' }]],
  globalSetup: './e2e/global-setup.staging.ts',
  globalTeardown: './e2e/global-teardown.staging.ts',

  use: {
    baseURL: FRONTEND_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
