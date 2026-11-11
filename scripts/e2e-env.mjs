// e2e-env.mjs – the settings of one e2e run: its throwaway database, its ports, and the database server to use.
// Shared by playwright.config.ts, the e2e helpers and scripts/e2e-backend.mjs so they always agree.
//
// Every run gets a brand-new database named ticketflow_e2e_<timestamp>_<pid> and two free ports (backend and
// frontend). They are chosen once, by the first process that loads this file (Playwright's main process), and passed
// on through environment variables, so the workers and the web servers it starts all see the same values.
//
// The database server (host, port, user, password) comes from E2E_DB_HOST / E2E_DB_PORT / E2E_DB_USER /
// E2E_DB_PASSWORD, or else from the backend's .env. The database NAME never comes from there: the real database is
// never used, and assertE2eDbName() refuses any name that doesn't start with "ticketflow_e2e_".
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const ENV_FILE = path.join(ROOT, 'e2e', '.env.test')
export const BACKEND_DIR = path.resolve(ROOT, process.env.BACKEND_DIR || '../Ctrl-HelpBackend')
export const E2E_DB_PREFIX = 'ticketflow_e2e_'

// Minimal KEY=value parser (comments and blank lines skipped), enough for .env files
export function loadEnvFile(file) {
  const env = {}
  if (!fs.existsSync(file)) return env
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (match) env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2')
  }
  return env
}

// Throws unless the name is clearly an e2e throwaway database (and safe to put in SQL between backticks)
export function assertE2eDbName(name) {
  if (typeof name !== 'string' || !name.startsWith(E2E_DB_PREFIX) || !/^[a-z0-9_]+$/.test(name)) {
    throw new Error(`Refusing to run: the e2e database name must start with "${E2E_DB_PREFIX}", got "${name}"`)
  }
  return name
}

// Two free TCP ports, found by a short child process (this module has to stay synchronous for playwright.config.ts)
function freePorts() {
  const script = `
    const net = require('net')
    const take = () => new Promise((resolve) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => resolve(s)) })
    Promise.all([take(), take()]).then((servers) => {
      console.log(servers.map((s) => s.address().port).join(' '))
      servers.forEach((s) => s.close())
    })`
  return execFileSync(process.execPath, ['-e', script], { encoding: 'utf8' }).trim().split(' ').map(Number)
}

if (!process.env.E2E_DB_NAME) {
  const [apiPort, webPort] = freePorts()
  process.env.E2E_DB_NAME = `${E2E_DB_PREFIX}${Date.now()}_${process.pid}`
  process.env.E2E_API_PORT = String(apiPort)
  process.env.E2E_WEB_PORT = String(webPort)
}

export const DB_NAME = assertE2eDbName(process.env.E2E_DB_NAME)
export const API_PORT = Number(process.env.E2E_API_PORT)
export const FRONTEND_PORT = Number(process.env.E2E_WEB_PORT)
export const API_URL = `http://localhost:${API_PORT}/api`
export const FRONTEND_URL = `http://localhost:${FRONTEND_PORT}`
// Where this run's backend saves every email it sends (as .json files), so tests can open set-password links.
// Removed with the database.
// How this run's backend delivers new and reset passwords: 'email' (one-time links, the default) or
// 'temporary_password' (E2E_PASSWORD_DELIVERY=temporary_password: email not set up; npm run e2e:temporary-passwords)
export const PASSWORD_DELIVERY =
  process.env.E2E_PASSWORD_DELIVERY === 'temporary_password' ? 'temporary_password' : 'email'

export const mailOutboxFor = (dbName) => path.join(os.tmpdir(), 'ticketflow-e2e-mail', assertE2eDbName(dbName))
export const MAIL_OUTBOX_DIR = mailOutboxFor(DB_NAME)

// Attachment files of this run (the backend's UPLOAD_DIR): a temporary folder per run database, never the backend's
// real uploads/ folder. Deleted together with the database (scripts/e2e-backend.mjs drop / cleanup).
export const uploadDirFor = (dbName) => path.join(os.tmpdir(), 'ticketflow-e2e-uploads', assertE2eDbName(dbName))
export const UPLOAD_DIR = uploadDirFor(DB_NAME)

// The database server: E2E_DB_* if set (CI), otherwise the backend's .env (your normal MySQL/MariaDB)
const backendEnv = loadEnvFile(path.join(BACKEND_DIR, '.env'))
export const DB_SERVER = {
  host: process.env.E2E_DB_HOST ?? backendEnv.DB_HOST ?? '127.0.0.1',
  port: Number(process.env.E2E_DB_PORT ?? backendEnv.DB_PORT ?? 3306),
  user: process.env.E2E_DB_USER ?? backendEnv.DB_USER ?? 'root',
  password: process.env.E2E_DB_PASSWORD ?? backendEnv.DB_PASSWORD ?? '',
}

// Backend settings that are the same for every run (test-only JWT key), from e2e/.env.test
export const TEST_SETTINGS = loadEnvFile(ENV_FILE)
