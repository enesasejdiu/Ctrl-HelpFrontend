// global-setup.staging.ts – before a staging run (playwright.staging.config.ts): checks the staging admin can sign
// in, makes this run's own employee and agent through the API (e2e-<runId>-employee@example.test, …-agent@…), and
// saves the user's and the admin's sessions. Nothing touches staging's database directly, and nothing is printed that
// holds a password. The accounts are deactivated again by global-teardown.staging.ts.
import { request } from '@playwright/test'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import globalTeardown from './global-teardown.staging'
import { Api } from './support/fixtures'
import { saveLogins } from './support/logins'
import { API_URL, FRONTEND_URL, RUN_PREFIX, STAGING_ACCOUNTS_FILE, TEST_EMAIL_DOMAIN } from './support/target'

export default async function globalSetup() {
  const host = new URL(FRONTEND_URL).host
  console.log(`[e2e:staging] ${host}, run prefix ${RUN_PREFIX} (accounts on @${TEST_EMAIL_DOMAIN})`)

  // How staging delivers passwords decides how the run's accounts get theirs (support/fixtures.ts)
  const anonymous = await request.newContext({ baseURL: `${API_URL}/` })
  const { email_enabled: emailEnabled } = await (await anonymous.get('settings/public')).json()
  await anonymous.dispose()
  console.log(
    `[e2e:staging] email on staging: ${emailEnabled ? 'on (set-password links)' : 'off (temporary passwords)'}`,
  )

  const api = new Api(() => request.newContext({ baseURL: `${API_URL}/` }))
  try {
    // A password nobody knows outside this run (letters and digits, as the backend requires)
    const password = () => `E2e${crypto.randomBytes(12).toString('hex')}9`
    const accounts = {
      user: {
        name: `${RUN_PREFIX}Employee`,
        password: password(),
        email: `${RUN_PREFIX}employee@${TEST_EMAIL_DOMAIN}`,
      },
      agent: { name: `${RUN_PREFIX}Agent`, password: password(), email: `${RUN_PREFIX}agent@${TEST_EMAIL_DOMAIN}` },
    }
    await api.createReadyEmployee(accounts.user.name, accounts.user.email, accounts.user.password, 'employee')
    await api.createReadyEmployee(accounts.agent.name, accounts.agent.email, accounts.agent.password, 'agent')

    const file = STAGING_ACCOUNTS_FILE as string
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, JSON.stringify(accounts), { mode: 0o600 })
    await saveLogins()
  } catch (err) {
    // Playwright skips the global teardown when the setup fails: clean up here, so a half-made account isn't left
    // active on staging, then report the failure (the teardown signs in on its own)
    await globalTeardown()
    throw err
  } finally {
    await api.dispose()
  }
}
