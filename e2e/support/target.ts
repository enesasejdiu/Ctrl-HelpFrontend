// target.ts – where this e2e run points: its own local backend + frontend (npm run e2e; scripts/e2e-env.mjs) or the
// shared staging server (npm run e2e:staging; scripts/staging-env.mjs). Tests import addresses from here, never from
// either script directly: only the chosen one is loaded, so a staging run never reads the backend's local settings.
// playwright.staging.config.ts sets E2E_TARGET=staging; the workers inherit it.
export const STAGING = process.env.E2E_TARGET === 'staging'

const settings = STAGING ? await import('../../scripts/staging-env.mjs') : await import('../../scripts/e2e-env.mjs')

export const API_URL: string = settings.API_URL
export const FRONTEND_URL: string = settings.FRONTEND_URL

// Every name and email a run creates starts with this, so its data can be found (and cleaned up on staging)
if (!process.env.E2E_RUN_ID) process.env.E2E_RUN_ID = Date.now().toString(36)
export const RUN_PREFIX = `e2e-${process.env.E2E_RUN_ID}-`

// Test accounts' email domain: .test is reserved and never delivers mail, so no email reaches a real person
export const TEST_EMAIL_DOMAIN = 'example.test'

// staging only: the file with the accounts this run created (global-setup.staging.ts)
export const STAGING_ACCOUNTS_FILE: string | undefined = STAGING
  ? (settings as typeof import('../../scripts/staging-env.mjs')).ACCOUNTS_FILE
  : undefined
