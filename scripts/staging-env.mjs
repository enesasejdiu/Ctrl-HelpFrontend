// staging-env.mjs – the settings of an e2e run against the shared STAGING server (npm run e2e:staging,
// playwright.staging.config.ts). Nothing here starts a server or touches a database: the tests use the deployed app
// and create their own data through its API.
//
// Safety: STAGING_URL must be an https:// address whose host is on the allowlist (e2e/staging-hosts.json, reviewed in
// a pull request like any other change) and doesn't look like production; anything else stops the run before a single
// request is made. localhost/127.0.0.1 are always allowed (and may be http): a local rehearsal, never production.
//
// Accounts come from the environment, never from files in the repository, and are never printed:
//   STAGING_ADMIN_EMAIL, STAGING_ADMIN_PASSWORD     required: an admin on staging
// The employee and agent the tests act as are created by the run itself (e2e/global-setup.staging.ts). Every name and
// email the run creates starts with RUN_PREFIX (e2e-<runId>-) and uses @example.test, which never delivers mail.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ALLOWLIST_FILE = path.join(ROOT, 'e2e', 'staging-hosts.json')
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]']
// A host that names one of these is production-like whatever the allowlist says (a typo or a copied URL)
const PRODUCTION_WORDS = /(^|[.-])(prod|production|live|www)([.-]|$)/i

// Why STAGING_URL may not be used, or null when it may
export function stagingUrlProblem(raw, allowlist) {
  if (!raw) return 'STAGING_URL is not set (e.g. https://tickets-staging.example.com)'
  let url
  try {
    url = new URL(raw)
  } catch {
    return `STAGING_URL is not a URL: ${raw}`
  }
  if (url.pathname !== '/' || url.search || url.hash) return 'STAGING_URL must be the site address only, without a path'
  if (url.username || url.password) return 'STAGING_URL must not contain credentials'
  const host = url.hostname.toLowerCase()
  if (LOCAL_HOSTS.includes(host)) return null
  if (url.protocol !== 'https:') return `STAGING_URL must be https:// (got ${url.protocol}//${host})`
  if (PRODUCTION_WORDS.test(host)) return `Refusing ${host}: it looks like production`
  if (!allowlist.includes(host)) {
    return `Refusing ${host}: it is not on the staging allowlist (e2e/staging-hosts.json). Add the staging host there in a pull request.`
  }
  return null
}

export function readAllowlist() {
  const { hosts } = JSON.parse(fs.readFileSync(ALLOWLIST_FILE, 'utf8'))
  return hosts.map((host) => String(host).toLowerCase())
}

const problem = stagingUrlProblem(process.env.STAGING_URL, readAllowlist())
if (problem) throw new Error(`[e2e:staging] ${problem}`)
for (const name of ['STAGING_ADMIN_EMAIL', 'STAGING_ADMIN_PASSWORD']) {
  if (!process.env[name]) throw new Error(`[e2e:staging] ${name} is not set (an admin account on staging)`)
}

// One id per run, chosen by the first process that loads this file and passed on to the workers, like e2e-env.mjs
if (!process.env.E2E_RUN_ID) process.env.E2E_RUN_ID = Date.now().toString(36)
export const RUN_ID = process.env.E2E_RUN_ID
export const RUN_PREFIX = `e2e-${RUN_ID}-`

export const FRONTEND_URL = process.env.STAGING_URL.replace(/\/+$/, '')
export const API_URL = `${FRONTEND_URL}/api`
// The accounts this run creates (written by the global setup, read by the tests); in the git-ignored e2e/.auth/
export const ACCOUNTS_FILE = path.join(ROOT, 'e2e', '.auth', `staging-accounts-${RUN_ID}.json`)
