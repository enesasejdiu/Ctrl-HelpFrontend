// e2e-env.mjs – reads e2e/.env.test, the single source of the e2e ports and database settings.
// Shared by scripts/e2e-backend.mjs and playwright.config.ts so both always agree.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const ENV_FILE = path.join(ROOT, 'e2e', '.env.test')

// Minimal KEY=value parser (comments and blank lines skipped), enough for .env.test
export function loadTestEnv(file = ENV_FILE) {
  const env = {}
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (match) env[match[1]] = match[2]
  }
  return env
}

const env = loadTestEnv()
export const API_URL = `http://localhost:${env.PORT}/api`
export const FRONTEND_URL = env.CLIENT_URL
export const FRONTEND_PORT = new URL(FRONTEND_URL).port
