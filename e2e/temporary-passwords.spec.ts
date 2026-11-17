// @local-only: not in the staging run (playwright.staging.config.ts): needs the backend started with email off, in a run of its own.
// temporary-passwords.spec.ts – the app when the backend has no email set up (password_delivery
// 'temporary_password'): a new account and an Admin/HR reset show a temporary password once, the user must replace it
// on /set-password before anything else, there is no "Resend link", and the sign-in page has no "Forgot password?"
// link. Runs only in its own e2e run: npm run e2e:temporary-passwords (playwright.config.ts).
import type { Browser, Page } from '@playwright/test'
import { expect, test } from './support/fixtures'
import { authFile } from './support/users'

test.use({ storageState: authFile('admin') })

// Reads the one-time password from the dialog and closes it
async function takeTemporaryPassword(page: Page) {
  const dialog = page.getByRole('alertdialog')
  const password = (await dialog.locator('code').textContent())?.trim() ?? ''
  expect(password).toMatch(/^[A-Za-z0-9]{12,}$/)
  await dialog.getByRole('button', { name: 'Done' }).click()
  return password
}

async function addUser(page: Page, name: string, email: string) {
  await page.goto('/admin/users')
  await page.getByRole('button', { name: 'Add user' }).click()
  const dialog = page.getByRole('dialog', { name: 'Add user' })
  await dialog.getByLabel('Full name').fill(name)
  await dialog.getByLabel('Email').fill(email)
  await dialog.getByRole('button', { name: 'Create user' }).click()
  return takeTemporaryPassword(page)
}

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/login')
  await page.getByLabel('Work email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
}

// "Set your password" (/set-password) after signing in with a temporary password
async function setPassword(page: Page, temporary: string, next: string) {
  await page.getByLabel('Temporary password').fill(temporary)
  await page.getByLabel('New password', { exact: true }).fill(next)
  await page.getByLabel('Confirm new password').fill(next)
  await page.getByRole('button', { name: 'Set password' }).click()
}

async function freshPage(browser: Browser) {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  return { context, page: await context.newPage() }
}

test('a new account gets a temporary password, which must be replaced before anything else', async ({
  page,
  browser,
  uniq,
}) => {
  // Two browsers signing in: slow in Firefox (like hr-flow.spec.ts), so triple the time
  test.slow()
  const email = `${uniq}@example.test`
  const name = `Temp Starter ${uniq}`
  const temporary = await addUser(page, name, email)
  // No email, so no "Resend link" and no "emailed" notice
  await expect(page.getByRole('button', { name: `Resend link to ${name}` })).toHaveCount(0)
  await expect(page.getByText(/was emailed/)).toHaveCount(0)

  const { context, page: newUser } = await freshPage(browser)
  await signIn(newUser, email, temporary)
  await expect(newUser).toHaveURL('/set-password')
  await expect(newUser.getByRole('heading', { name: 'Set your password' })).toBeVisible()
  await newUser.goto('/tickets/new')
  await expect(newUser).toHaveURL('/set-password')

  await setPassword(newUser, 'not-the-temp-password', 'MyOwnPassword1')
  await expect(newUser.getByLabel('Temporary password')).toHaveAccessibleDescription('Current password is wrong')
  await setPassword(newUser, temporary, 'MyOwnPassword1')
  await expect(newUser).toHaveURL('/tickets')
  await expect(newUser.getByRole('status')).toHaveText('Password changed')
  await context.close()
})

test('a reset shows a new temporary password and ends the user’s session', async ({ page, browser, uniq }) => {
  test.slow()
  const email = `${uniq}@example.test`
  const name = `Temp Reset ${uniq}`
  const first = await addUser(page, name, email)
  const { context, page: user } = await freshPage(browser)
  await signIn(user, email, first)
  await setPassword(user, first, 'FirstChoice123')
  await expect(user).toHaveURL('/tickets')

  await page.getByRole('button', { name: `Reset password for ${name}` }).click()
  await page
    .getByRole('alertdialog', { name: 'Reset password' })
    .getByRole('button', { name: 'Reset password' })
    .click()
  const second = await takeTemporaryPassword(page)

  await user.reload()
  await expect(user).toHaveURL(/\/login/)
  await signIn(user, email, 'FirstChoice123')
  await expect(user.getByRole('alert')).toHaveText('Wrong email or password')
  await signIn(user, email, second)
  await setPassword(user, second, 'SecondChoice123')
  await expect(user).toHaveURL('/tickets')
  await context.close()
})

test('the sign-in page has no "Forgot password?" link; /forgot-password still gives the usual answer', async ({
  browser,
}) => {
  const { context, page } = await freshPage(browser)
  const config = page.waitForResponse((r) => r.url().endsWith('/api/auth/config'))
  await page.goto('/login')
  expect(await (await config).json()).toEqual({ email_enabled: false })
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Forgot password?' })).toHaveCount(0)

  // Typed in by hand: the same 200 and confirmation as with email (nothing is sent; the backend logs a warning)
  await page.goto('/forgot-password')
  await page.getByLabel('Work email').fill('employee1@ticketflow.local')
  const answer = page.waitForResponse((r) => r.url().endsWith('/api/auth/forgot-password'))
  await page.getByRole('button', { name: 'Send reset link' }).click()
  expect((await answer).status()).toBe(200)
  await expect(page.getByRole('status')).toContainText(
    "If an account exists for this email, we've sent a password reset link.",
  )
  await context.close()
})
