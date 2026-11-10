// global-setup.ts – logs in once per seeded role through the API and saves the session as a storageState file,
// so tests start logged in without going through the login form every time.
// The session is the backend's cookies (tf_session + tf_csrf), so those are what gets saved.
// If it fails, this run's database is dropped here, because the global teardown may not run then.
import { request } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { API_URL } from '../scripts/e2e-env.mjs'
import { PASSWORD, USERS, authFile } from './support/users'

export default async function globalSetup() {
  try {
    await saveLogins()
  } catch (err) {
    execFileSync(process.execPath, ['scripts/e2e-backend.mjs', 'drop'], { stdio: 'inherit' })
    throw err
  }
}

async function saveLogins() {
  for (const role of ['user', 'admin'] as const) {
    // One request context per role, so each gets its own cookie jar
    const api = await request.newContext({ baseURL: `${API_URL}/` })
    const response = await api.post('auth/login', { data: { email: USERS[role].email, password: PASSWORD } })
    if (!response.ok()) {
      throw new Error(`Global setup: logging in as ${role} failed (${response.status()}): ${await response.text()}`)
    }

    // The login set the session cookies (tf_session, httpOnly, and tf_csrf) for the API's host; save them as the
    // browser's state. Cookies don't depend on the port, so the app on FRONTEND_URL sends them to the API too.
    const file = authFile(role)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    await api.storageState({ path: file })
    await api.dispose()
  }
}
