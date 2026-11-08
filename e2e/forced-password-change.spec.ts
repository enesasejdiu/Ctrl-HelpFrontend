// forced-password-change.spec.ts – an account made by an admin (or a password reset) gives a temporary password;
// the user has to choose their own before they can use the app. Real backend, real database.
import type { Page } from '@playwright/test'
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

async function choosePassword(page: Page, current: string, next: string) {
  await page.getByLabel(/Temporary password|Current password/).fill(current)
  await page.getByLabel('New password', { exact: true }).fill(next)
  await page.getByLabel('Repeat new password').fill(next)
  await page.getByRole('button', { name: 'Save new password' }).click()
}

// A browser with no saved session, for the new user
async function freshPage(browser: import('@playwright/test').Browser) {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  return { context, page: await context.newPage() }
}

test('a new account must choose its own password at first sign-in', async ({ page, browser, uniq }) => {
  const email = `${uniq}@test.local`
  const temporary = await addUser(page, `New Starter ${uniq}`, email)

  const { context, page: newUser } = await freshPage(browser)
  await signIn(newUser, email, temporary)

  // Sent to choose a password, and kept there even when asking for another page
  await expect(newUser).toHaveURL('/change-password')
  await expect(newUser.getByRole('heading', { name: 'Choose your own password' })).toBeVisible()
  await newUser.goto('/tickets/new')
  await expect(newUser).toHaveURL('/change-password')

  // A wrong temporary password is refused without logging out
  await choosePassword(newUser, 'not-the-temp-password', 'MyOwnPassword1')
  await expect(newUser.getByRole('alert')).toHaveText('Current password is wrong')
  await expect(newUser).toHaveURL('/change-password')

  await choosePassword(newUser, temporary, 'MyOwnPassword1')
  await expect(newUser).toHaveURL('/tickets/new')
  await expect(newUser.getByRole('heading', { name: 'New ticket' })).toBeVisible()

  // The temporary password no longer works; the new one does
  await newUser.getByRole('button', { name: 'Log out' }).click()
  await signIn(newUser, email, temporary)
  await expect(newUser.getByRole('alert')).toHaveText('Wrong email or password')
  await newUser.getByLabel('Password', { exact: true }).fill('MyOwnPassword1')
  await newUser.getByRole('button', { name: 'Sign in' }).click()
  await expect(newUser).toHaveURL(/\/tickets/)
  await expect(newUser).not.toHaveURL(/change-password/)
  await context.close()
})

test('a password reset during a session sends the user to choose a new one', async ({ page, browser, uniq }) => {
  const email = `${uniq}@test.local`
  const name = `Reset Me ${uniq}`
  const first = await addUser(page, name, email)

  const { context, page: user } = await freshPage(browser)
  await signIn(user, email, first)
  await choosePassword(user, first, 'FirstChoice123')
  await expect(user).toHaveURL('/tickets')

  // Admin resets it while the user is still signed in
  await page.getByRole('button', { name: `Reset password for ${name}` }).click()
  await page.getByRole('alertdialog', { name: 'Reset password' }).getByRole('button', { name: 'Reset password' }).click()
  const second = await takeTemporaryPassword(page)

  // The user's next page load is refused by the backend, so the app sends them to change it
  await user.reload()
  await expect(user).toHaveURL('/change-password')
  await choosePassword(user, second, 'SecondChoice123')
  await expect(user).toHaveURL('/tickets')
  await context.close()
})

test('anyone can change their password from the top bar', async ({ page, browser, uniq }) => {
  const email = `${uniq}@test.local`
  const temporary = await addUser(page, `Changer ${uniq}`, email)

  const { context, page: user } = await freshPage(browser)
  await signIn(user, email, temporary)
  await choosePassword(user, temporary, 'FirstChoice123')
  await expect(user).toHaveURL('/tickets')

  await user.getByRole('link', { name: 'Change password' }).click()
  await expect(user.getByRole('heading', { name: 'Change password' })).toBeVisible()
  await choosePassword(user, 'FirstChoice123', 'SecondChoice123')
  await expect(user).toHaveURL('/tickets')

  await user.getByRole('button', { name: 'Log out' }).click()
  await signIn(user, email, 'SecondChoice123')
  await expect(user).toHaveURL('/tickets')
  await context.close()
})
