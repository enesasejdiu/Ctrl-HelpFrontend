// session.spec.ts – the cookie session end to end: log in, reload and stay logged in, log out and be sent to /login.
// At every step the page's scripts must not be able to see the token: nothing in localStorage or sessionStorage, and
// the session cookie is httpOnly (not in document.cookie).
import type { BrowserContext, Page } from '@playwright/test'
import { expect, test } from './support/fixtures'
import { PASSWORD, USERS } from './support/users'

// What the page itself can see: web storage and the cookies JavaScript can read
async function visibleToScripts(page: Page) {
  return page.evaluate(() => ({
    localStorage: Object.keys(localStorage),
    sessionStorage: Object.keys(sessionStorage),
    cookies: document.cookie,
  }))
}

async function expectNoTokenVisible(page: Page) {
  const seen = await visibleToScripts(page)
  expect(seen.localStorage).toEqual([])
  expect(seen.sessionStorage).toEqual([])
  expect(seen.cookies).not.toContain('tf_session')
}

const sessionCookie = async (context: BrowserContext) =>
  (await context.cookies()).find((cookie) => cookie.name === 'tf_session')

test('log in, reload and stay logged in, log out; the token is never visible to the page', async ({ page, context }) => {
  await page.goto('/login')
  await expectNoTokenVisible(page)

  await page.getByLabel('Work email').fill(USERS.user.email)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('heading', { name: 'My tickets' })).toBeVisible()

  // The session is an httpOnly, SameSite=Lax cookie; the readable CSRF cookie sits next to it
  expect(await sessionCookie(context)).toMatchObject({ httpOnly: true, sameSite: 'Lax' })
  await expectNoTokenVisible(page)
  expect((await visibleToScripts(page)).cookies).toContain('tf_csrf=')

  // A reload asks the backend (GET /auth/me) and stays logged in, on the same page
  await page.reload()
  await expect(page).toHaveURL('/tickets')
  await expect(page.getByRole('heading', { name: 'My tickets' })).toBeVisible()
  await expectNoTokenVisible(page)

  await page.getByRole('button', { name: 'Log out' }).click()
  await expect(page).toHaveURL('/login')
  expect(await sessionCookie(context)).toBeUndefined()
  await expectNoTokenVisible(page)

  // Logged out for real: a protected page sends you back to /login, also after a reload
  await page.goto('/tickets')
  await expect(page).toHaveURL('/login')
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
})

test('a session that ends mid-way: back to /login saying so, and back to the page after signing in', async ({
  page,
  context,
}) => {
  await page.goto('/login')
  await page.getByLabel('Work email').fill(USERS.user.email)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('heading', { name: 'My tickets' })).toBeVisible()
  await page.waitForLoadState('networkidle')

  // The session cookie runs out (or is revoked): the next API call answers 401. An in-app link (no page load, so no
  // startup check) to a page that asks the API for something.
  await context.clearCookies({ name: 'tf_session' })
  await page.getByRole('link', { name: /My profile/ }).click()

  await expect(page.getByRole('status')).toHaveText('Your session has expired. Please log in again.')
  // The reason is taken out of the URL, so a reload doesn't repeat it
  await expect(page).toHaveURL('/login')
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
  await expect(page.getByText('Your session has expired.')).toHaveCount(0)

  // Signing in again returns to the page the request failed on
  await page.getByLabel('Work email').fill(USERS.user.email)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL('/profile')
})

test('logging out yourself shows no session-expired message', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Work email').fill(USERS.user.email)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('heading', { name: 'My tickets' })).toBeVisible()

  await page.getByRole('button', { name: 'Log out' }).click()

  await expect(page).toHaveURL('/login')
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
  await expect(page.getByText('Your session has expired.')).toHaveCount(0)
})

test('a request that changes something is sent with the CSRF header and no Authorization header', async ({ page, uniq }) => {
  await page.goto('/login')
  await page.getByLabel('Work email').fill(USERS.user.email)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('heading', { name: 'My tickets' })).toBeVisible()

  await page.goto('/tickets/new')
  await page.getByRole('textbox', { name: 'Title' }).fill(`Session check ${uniq}`)
  await page.getByRole('combobox', { name: 'Category' }).selectOption('Hardware')
  // Priorities are cards with a hidden radio inside; click the card like a user does
  await page.getByRole('group', { name: 'Priority' }).getByText('Medium', { exact: true }).click()
  await page.getByRole('textbox', { name: 'Description' }).fill('Checks how the request is sent.')
  const created = page.waitForRequest((request) => request.method() === 'POST' && request.url().endsWith('/api/tickets'))
  await page.getByRole('button', { name: 'Submit ticket' }).click()

  const request = await created
  const headers = await request.allHeaders()
  expect(headers['x-csrf-token']).toMatch(/^[0-9a-f]{64}$/)
  expect(headers).not.toHaveProperty('authorization')
  // Same origin: the page calls its own /api, which the dev server forwards to the backend
  expect(new URL(request.url()).origin).toBe(new URL(page.url()).origin)
  await expect(page.getByRole('heading', { name: `Session check ${uniq}` })).toBeVisible()
})
