// logins.ts – saves a logged-in session per role as a storageState file (support/users.ts authFile), through the
// frontend's /api like a browser. Used by both global setups (local and staging).
import { request } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { DEPLOYED, FRONTEND_URL } from './target'
import { account, authFile } from './users'

export async function saveLogins() {
  for (const role of ['user', 'admin'] as const) {
    // A context per role, so each file gets only that role's cookies
    // A deployed stack has its own (Caddy's local) certificate
    const api = await request.newContext({ baseURL: `${FRONTEND_URL}/api/`, ignoreHTTPSErrors: DEPLOYED })
    const { email, password } = account(role)
    const response = await api.post('auth/login', { data: { email, password } })
    if (!response.ok()) {
      // The answer's message only: it never contains the password
      const { message } = await response.json().catch(() => ({ message: '' }))
      throw new Error(`Global setup: logging in as ${role} failed (${response.status()}): ${message}`)
    }
    const state = await api.storageState()
    if (!state.cookies.some((cookie) => cookie.name === 'tf_session' && cookie.httpOnly)) {
      throw new Error(`Global setup: logging in as ${role} set no httpOnly tf_session cookie`)
    }

    const file = authFile(role)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, JSON.stringify({ cookies: state.cookies, origins: [] }), { mode: 0o600 })
    await api.dispose()
  }
}
