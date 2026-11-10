// lockout.spec.ts – account lockout end to end (@auth): 5 wrong passwords in a row lock the account, the login page says
// so (with the time left) and blocks the button, the right password is refused while locked, and other accounts carry
// on as normal.
//
// Backend rules (Ctrl-HelpBackend src/routes/auth.js):
// - The 5th wrong password itself locks the account and answers 423 ACCOUNT_LOCKED; attempts 1–4 answer 401.
// - The lock lasts 15 minutes. That's a constant in the backend with no test setting, so the "lock runs out" test is
//   skipped rather than waiting 15 minutes.
// - The per-IP login rate limit (429) is off when NODE_ENV=test, which the e2e backend always uses
//   (scripts/e2e-backend.mjs), so it can't fire before the lockout. Production keeps it.
//
// Every test makes its own employee (a unique email, password already set), so a locked account never gets in the way
// of another test, a parallel run or --repeat-each. Run only these with: npx playwright test --grep @auth
import type { Page, PlaywrightWorkerArgs, Response } from '@playwright/test'
import { API_URL } from '../scripts/e2e-env.mjs'
import en from '../src/i18n/en.js'
import { expect, test } from './support/fixtures'

const MAX_FAILED = 5
const LOCK_MINUTES = 15

// The app's own message texts (src/i18n/en.js), as patterns: {time} may be any of the given times
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
function message(key: keyof typeof en, time = '') {
  return new RegExp(`^${escape(en[key]).replace(escape('{time}'), time)}`)
}
// "about 15 minutes", or 14 if a minute ticks over during the test
const LOCK_TIME = `about 1[45] minutes`
const WRONG_CREDENTIALS = en['login.wrongCredentials']

const isLoginRequest = (response: Response) =>
  response.url().endsWith('/api/auth/login') && response.request().method() === 'POST'

// Fills the password, presses Sign in and resolves with the login API's response
async function submitPassword(page: Page, password: string) {
  await page.getByLabel('Password', { exact: true }).fill(password)
  const response = page.waitForResponse(isLoginRequest)
  await page.getByRole('button', { name: en['login.submit'] }).click()
  return response
}

// Locks an account through the API, checking each answer: 401 four times, then 423 on the 5th
async function lockThroughApi(playwright: PlaywrightWorkerArgs['playwright'], email: string) {
  const http = await playwright.request.newContext({ baseURL: `${API_URL}/` })
  try {
    for (let attempt = 1; attempt <= MAX_FAILED; attempt += 1) {
      const response = await http.post('auth/login', { data: { email, password: `wrong-password-${attempt}` } })
      expect(response.status(), `wrong password #${attempt}`).toBe(attempt < MAX_FAILED ? 401 : 423)
    }
  } finally {
    await http.dispose()
  }
}

// Whether the browser context has a session: GET /api/auth/me through the page's own cookies
async function isLoggedIn(page: Page) {
  const response = await page.request.get('/api/auth/me')
  return response.status() === 200
}

test.describe('Account lockout', { tag: '@auth' }, () => {
  test('locks the account after 5 wrong passwords', async ({ page, api, uniq }) => {
    const account = await api.createReadyEmployee(`Lockout ${uniq}`, `lockout.${uniq}@test.local`)
    await page.goto('/login')
    await page.getByLabel('Work email').fill(account.email)

    // Attempts 1–4: the generic message, and nothing about a lock yet
    for (let attempt = 1; attempt < MAX_FAILED; attempt += 1) {
      const response = await submitPassword(page, `wrong-password-${attempt}`)
      expect(response.status(), `wrong password #${attempt}`).toBe(401)
      await expect(page.getByRole('alert')).toHaveText(WRONG_CREDENTIALS)
      await expect(page.getByText(message('login.locked', '.*'))).toHaveCount(0)
      await expect(page.getByRole('timer')).toHaveCount(0)
    }

    // Attempt 5 locks the account, and already says so
    const response = await submitPassword(page, `wrong-password-${MAX_FAILED}`)
    expect(response.status()).toBe(423)
    expect(await response.json()).toMatchObject({ code: 'ACCOUNT_LOCKED', retryAfterMinutes: LOCK_MINUTES })
    const retryAfter = Number(response.headers()['retry-after'])
    expect(retryAfter).toBeGreaterThan((LOCK_MINUTES - 1) * 60)
    expect(retryAfter).toBeLessThanOrEqual(LOCK_MINUTES * 60)

    // The message is in the alert live region, with the time left and who can help
    const alert = page.getByRole('alert')
    await expect(alert).toContainText(message('login.locked', LOCK_TIME))
    await expect(alert).toContainText(en['login.lockedHelp'])
    await expect(alert.getByRole('timer')).toHaveText(new RegExp(`^${LOCK_TIME}$`))
    // The button is blocked and says for how long
    await expect(page.getByRole('button', { name: message('login.tryAgainIn', LOCK_TIME) })).toBeDisabled()
    await expect(page.getByRole('button', { name: en['login.submit'] })).toHaveCount(0)
    // Still on the login page, and no session
    await expect(page).toHaveURL('/login')
    expect(await isLoggedIn(page)).toBe(false)
  })

  test('the correct password is refused while the account is locked', async ({ page, api, uniq, playwright }) => {
    const account = await api.createReadyEmployee(`Locked right ${uniq}`, `locked.right.${uniq}@test.local`)
    await lockThroughApi(playwright, account.email)

    // Straight to the API: the right password gets 423, not a session
    const http = await playwright.request.newContext({ baseURL: `${API_URL}/` })
    const direct = await http.post('auth/login', { data: account })
    expect(direct.status()).toBe(423)
    expect(await direct.json()).toMatchObject({ code: 'ACCOUNT_LOCKED' })
    expect((await http.storageState()).cookies.map((cookie) => cookie.name)).not.toContain('tf_session')
    await http.dispose()

    // Through the form, on a page that doesn't know about the lock yet (so the button is enabled)
    await page.goto('/login')
    await page.getByLabel('Work email').fill(account.email)
    const response = await submitPassword(page, account.password)
    expect(response.status()).toBe(423)
    await expect(page.getByRole('alert')).toContainText(message('login.locked', LOCK_TIME))
    await expect(page.getByRole('button', { name: message('login.tryAgainIn', LOCK_TIME) })).toBeDisabled()
    await expect(page).toHaveURL('/login')
    expect(await isLoggedIn(page)).toBe(false)
  })

  test('other accounts are not affected', async ({ page, api, uniq, playwright }) => {
    const locked = await api.createReadyEmployee(`Locked A ${uniq}`, `locked.a.${uniq}@test.local`)
    const other = await api.createReadyEmployee(`Free B ${uniq}`, `free.b.${uniq}@test.local`)
    await lockThroughApi(playwright, locked.email)

    await page.goto('/login')
    await page.getByLabel('Work email').fill(other.email)
    const response = await submitPassword(page, other.password)
    expect(response.status()).toBe(200)
    await expect(page).toHaveURL('/tickets')
    await expect(page.getByRole('heading', { name: 'My tickets' })).toBeVisible()
    expect(await isLoggedIn(page)).toBe(true)
  })

  test('changing the email clears the lockout message and enables Sign in again', async ({
    page,
    api,
    uniq,
    playwright,
  }) => {
    const locked = await api.createReadyEmployee(`Locked C ${uniq}`, `locked.c.${uniq}@test.local`)
    await lockThroughApi(playwright, locked.email)

    await page.goto('/login')
    await page.getByLabel('Work email').fill(locked.email)
    expect((await submitPassword(page, locked.password)).status()).toBe(423)
    await expect(page.getByRole('button', { name: message('login.tryAgainIn', LOCK_TIME) })).toBeDisabled()

    // The lock belongs to that account, so another email gets the button back and the message goes
    await page.getByLabel('Work email').fill(`someone.else.${uniq}@test.local`)
    await expect(page.getByRole('button', { name: en['login.submit'] })).toBeEnabled()
    await expect(page.getByRole('alert')).toHaveCount(0)
    await expect(page.getByRole('timer')).toHaveCount(0)
  })

  test('the lock runs out and the correct password works again', async () => {
    test.skip(
      true,
      `The lock lasts ${LOCK_MINUTES} minutes (LOCK_MINUTES in the backend's src/routes/auth.js) and there is no test ` +
        'setting to shorten it. Needs a backend option such as LOGIN_LOCK_SECONDS for the test environment.',
    )
  })
})
