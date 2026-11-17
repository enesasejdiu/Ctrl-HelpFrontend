// @local-only: not in the staging run (playwright.staging.config.ts): needs the test-only LOCKOUT_MINUTES=1; its wrong passwords count against staging's per-IP login limit.
// lockout.spec.ts – account lockout end to end (@auth): 5 wrong passwords in a row lock the account, the login page says
// so (with the time left) and blocks the button, the right password is refused while locked, and other accounts carry
// on as normal.
//
// Backend rules (Ctrl-HelpBackend src/routes/auth.js):
// - The 5th wrong password itself locks the account and answers 423 ACCOUNT_LOCKED; attempts 1–4 answer 401.
// - The lock lasts 15 minutes, except in tests: the e2e backend runs with LOCKOUT_MINUTES=1 (e2e/.env.test), so the
//   "lock runs out" test only waits about a minute. The tests read the length from the 423 response
//   (retryAfterMinutes), never assume it.
// - The per-IP login rate limit (429) is off when NODE_ENV=test, which the e2e backend always uses
//   (scripts/e2e-backend.mjs), so it can't fire before the lockout. Production keeps it.
//
// Every test makes its own employee (a unique email, password already set), so a locked account never gets in the way
// of another test, a parallel run or --repeat-each. Run only these with: npx playwright test --grep @auth
import type { Page, PlaywrightWorkerArgs, Response } from '@playwright/test'
import { API_URL, DEPLOYED } from './support/target'
import en from '../src/i18n/en.js'
import { expect, test } from './support/fixtures'

const MAX_FAILED = 5

// The app's own message texts (src/i18n/en.js), as patterns: {time} may be any of the given times
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
function message(key: keyof typeof en, time = '') {
  return new RegExp(`^${escape(en[key]).replace(escape('{time}'), time)}`)
}
// The time left as the page shows it (src/utils/wait.js formatWait), for a lock of `minutes`: "m:ss" when it is 5
// minutes or less, otherwise "about N minutes" (or one less, if a minute ticks over during the test)
function lockTime(minutes: number) {
  if (minutes <= 5) return `[0-${minutes}]:[0-5]\\d`
  return `about (${minutes - 1}|${minutes}) minutes`
}
// The lock's length in minutes, from a 423 ACCOUNT_LOCKED response
async function lockMinutes(response: Response) {
  const body = await response.json()
  expect(body).toMatchObject({ code: 'ACCOUNT_LOCKED', retryAfterMinutes: expect.any(Number) })
  return body.retryAfterMinutes as number
}
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

// Locks an account through the API, checking each answer: 401 four times, then 423 on the 5th. Returns the lock's
// length in minutes, as the backend reports it.
async function lockThroughApi(playwright: PlaywrightWorkerArgs['playwright'], email: string) {
  const http = await playwright.request.newContext({ baseURL: `${API_URL}/`, ignoreHTTPSErrors: DEPLOYED })
  try {
    let minutes = 0
    for (let attempt = 1; attempt <= MAX_FAILED; attempt += 1) {
      const response = await http.post('auth/login', { data: { email, password: `wrong-password-${attempt}` } })
      expect(response.status(), `wrong password #${attempt}`).toBe(attempt < MAX_FAILED ? 401 : 423)
      if (attempt === MAX_FAILED) minutes = (await response.json()).retryAfterMinutes
    }
    expect(minutes).toBeGreaterThan(0)
    return minutes
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
    const account = await api.createReadyEmployee(`Lockout ${uniq}`, `lockout.${uniq}@example.test`)
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
    const minutes = await lockMinutes(response)
    const retryAfter = Number(response.headers()['retry-after'])
    expect(retryAfter).toBeGreaterThan((minutes - 1) * 60)
    expect(retryAfter).toBeLessThanOrEqual(minutes * 60)

    // The message is in the alert live region, with the time left and who can help
    const time = lockTime(minutes)
    const alert = page.getByRole('alert')
    await expect(alert).toContainText(message('login.locked', time))
    await expect(alert).toContainText(en['login.lockedHelp'])
    await expect(alert.getByRole('timer')).toHaveText(new RegExp(`^${time}$`))
    // The button is blocked and says for how long
    await expect(page.getByRole('button', { name: message('login.tryAgainIn', time) })).toBeDisabled()
    await expect(page.getByRole('button', { name: en['login.submit'] })).toHaveCount(0)
    // Still on the login page, and no session
    await expect(page).toHaveURL('/login')
    expect(await isLoggedIn(page)).toBe(false)
  })

  test('the correct password is refused while the account is locked', async ({ page, api, uniq, playwright }) => {
    const account = await api.createReadyEmployee(`Locked right ${uniq}`, `locked.right.${uniq}@example.test`)
    await lockThroughApi(playwright, account.email)

    // Straight to the API: the right password gets 423, not a session
    const http = await playwright.request.newContext({ baseURL: `${API_URL}/`, ignoreHTTPSErrors: DEPLOYED })
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
    const time = lockTime(await lockMinutes(response))
    await expect(page.getByRole('alert')).toContainText(message('login.locked', time))
    await expect(page.getByRole('button', { name: message('login.tryAgainIn', time) })).toBeDisabled()
    await expect(page).toHaveURL('/login')
    expect(await isLoggedIn(page)).toBe(false)
  })

  test('other accounts are not affected', async ({ page, api, uniq, playwright }) => {
    const locked = await api.createReadyEmployee(`Locked A ${uniq}`, `locked.a.${uniq}@example.test`)
    const other = await api.createReadyEmployee(`Free B ${uniq}`, `free.b.${uniq}@example.test`)
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
    const locked = await api.createReadyEmployee(`Locked C ${uniq}`, `locked.c.${uniq}@example.test`)
    await lockThroughApi(playwright, locked.email)

    await page.goto('/login')
    await page.getByLabel('Work email').fill(locked.email)
    const response = await submitPassword(page, locked.password)
    expect(response.status()).toBe(423)
    const time = lockTime(await lockMinutes(response))
    await expect(page.getByRole('button', { name: message('login.tryAgainIn', time) })).toBeDisabled()

    // The lock belongs to that account, so another email gets the button back and the message goes
    await page.getByLabel('Work email').fill(`someone.else.${uniq}@example.test`)
    await expect(page.getByRole('button', { name: en['login.submit'] })).toBeEnabled()
    await expect(page.getByRole('alert')).toHaveCount(0)
    await expect(page.getByRole('timer')).toHaveCount(0)
  })

  test('the lock runs out and the correct password works again', async ({ page, api, uniq, playwright }) => {
    // A deployed stack runs in production, where the lock is always 15 minutes: too long to wait for
    test.skip(DEPLOYED, 'production locks accounts for 15 minutes; only the e2e backend shortens it to 1')
    const account = await api.createReadyEmployee(`Lock ends ${uniq}`, `lock.ends.${uniq}@example.test`)
    const minutes = await lockThroughApi(playwright, account.email)
    // The e2e backend locks for 1 minute (LOCKOUT_MINUTES in e2e/.env.test); anything longer would make this test wait
    expect(minutes, 'LOCKOUT_MINUTES=1 for the e2e backend').toBe(1)
    test.setTimeout(minutes * 60_000 + 60_000)

    // While locked, the right password is refused and the page counts down
    await page.goto('/login')
    await page.getByLabel('Work email').fill(account.email)
    expect((await submitPassword(page, account.password)).status()).toBe(423)
    await expect(page.getByRole('timer')).toBeVisible()

    // When the countdown reaches zero the page says so and gives the button back (no fixed wait: it follows the page)
    await expect(page.getByText(en['login.lockEnded'])).toBeVisible({ timeout: minutes * 60_000 + 15_000 })
    await expect(page.getByRole('button', { name: en['login.submit'] })).toBeEnabled()
    await expect(page.getByRole('timer')).toHaveCount(0)

    // The lock has run out on the server too: the right password works and signs in
    const response = await submitPassword(page, account.password)
    expect(response.status()).toBe(200)
    await expect(page).toHaveURL('/tickets')
    await expect(page.getByRole('heading', { name: 'My tickets' })).toBeVisible()
    expect(await isLoggedIn(page)).toBe(true)
  })
})
