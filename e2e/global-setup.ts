// global-setup.ts – logs in once per seeded role through the API and saves the session as a storageState file,
// so tests start logged in without going through the login form every time.
// The app keeps its session in localStorage (ticketflow.token / ticketflow.user), so that's what gets saved.
import { request } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { API_URL, FRONTEND_URL } from '../scripts/e2e-env.mjs'
import { PASSWORD, USERS, authFile } from './support/users'

export default async function globalSetup() {
  const api = await request.newContext({ baseURL: `${API_URL}/` })

  for (const role of ['user', 'admin'] as const) {
    const response = await api.post('auth/login', { data: { email: USERS[role].email, password: PASSWORD } })
    if (!response.ok()) {
      throw new Error(`Global setup: logging in as ${role} failed (${response.status()}): ${await response.text()}`)
    }
    const { token, user } = await response.json()

    const file = authFile(role)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(
      file,
      JSON.stringify({
        cookies: [],
        origins: [
          {
            origin: FRONTEND_URL,
            localStorage: [
              { name: 'ticketflow.token', value: token },
              { name: 'ticketflow.user', value: JSON.stringify(user) },
            ],
          },
        ],
      }),
    )
  }

  await api.dispose()
}
