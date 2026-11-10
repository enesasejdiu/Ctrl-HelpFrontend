// global-setup.ts – logs in once per seeded role and saves the session as a storageState file, so tests start logged
// in without going through the login form every time.
// The session is the backend's cookies (tf_session, httpOnly, and tf_csrf), so that's all the file holds; the app
// keeps nothing in localStorage. Logging in through the frontend's /api proxy gives the cookies exactly as a browser
// on the app gets them.
// If it fails, this run's database is dropped here, because the global teardown may not run then.
import { request } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { FRONTEND_URL } from '../scripts/e2e-env.mjs'
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
    // A context per role, so each file gets only that role's cookies
    const api = await request.newContext({ baseURL: `${FRONTEND_URL}/api/` })
    const response = await api.post('auth/login', { data: { email: USERS[role].email, password: PASSWORD } })
    if (!response.ok()) {
      throw new Error(`Global setup: logging in as ${role} failed (${response.status()}): ${await response.text()}`)
    }
    const state = await api.storageState()
    if (!state.cookies.some((cookie) => cookie.name === 'tf_session' && cookie.httpOnly)) {
      throw new Error(`Global setup: logging in as ${role} set no httpOnly tf_session cookie`)
    }

    const file = authFile(role)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, JSON.stringify({ cookies: state.cookies, origins: [] }))
    await api.dispose()
  }
}
