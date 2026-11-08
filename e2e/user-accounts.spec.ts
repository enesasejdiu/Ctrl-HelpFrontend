// user-accounts.spec.ts – an admin creates an account and resets a password; the new user signs in with the
// temporary password and has to choose their own before they can use the app. Real backend, real database.
import type { Page } from '@playwright/test'
import { expect, test } from './support/fixtures'
import { authFile } from './support/users'

test.use({ storageState: authFile('admin') })

// Reads the one-time password from the notice and closes it
async function takeTemporaryPassword(page: Page) {
  const notice = page.getByRole('status').filter({ hasText: 'temporary password' })
  const password = (await notice.getByLabel('Temporary password').textContent())?.trim() ?? ''
  expect(password).toMatch(/^[A-Za-z0-9]{12,}$/)
  await notice.getByRole('button', { name: 'Done' }).click()
  return password
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

test('a new account must choose its own password at first sign-in', async ({ page, browser, uniq }) => {
  const email = `${uniq}@test.local`
  const name = `New Starter ${uniq}`

  // Admin creates the account
  await page.goto('/admin/users')
  await page.getByRole('button', { name: 'New user' }).click()
  const form = page.getByRole('form', { name: 'New user' })
  await form.getByLabel('Name').fill(name)
  await form.getByLabel('Work email').fill(email)
  await form.getByLabel(/Department/).fill('Sales')
  await form.getByRole('button', { name: 'Create user' }).click()

  await expect(page.getByRole('status')).toContainText(`Account created for ${name}`)
  const temporary = await takeTemporaryPassword(page)
  const row = page.getByRole('row').filter({ hasText: email })
  await expect(row.getByText('Temporary password')).toBeVisible()

  // The new user, in a fresh browser with no saved session
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const newUser = await context.newPage()
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

  await newUser.getByLabel('Temporary password').fill('')
  await choosePassword(newUser, temporary, 'MyOwnPassword1')
  await expect(newUser).toHaveURL('/tickets/new')
  await expect(newUser.getByRole('heading', { name: 'New ticket' })).toBeVisible()

  // The temporary password no longer works; the new one does
  await newUser.getByRole('button', { name: 'Log out' }).click()
  await signIn(newUser, email, temporary)
  await expect(newUser.getByRole('alert')).toHaveText('Wrong email or password')
  await newUser.getByLabel('Password', { exact: true }).fill('MyOwnPassword1')
  await newUser.getByRole('button', { name: 'Sign in' }).click()
  // In (back on a tickets page), and not asked to change the password again
  await expect(newUser).toHaveURL(/\/tickets/)
  await expect(newUser).not.toHaveURL(/change-password/)
  await context.close()

  // Back in the admin's list, the account no longer has a temporary password
  await page.reload()
  await expect(page.getByRole('row').filter({ hasText: email }).getByText('Temporary password')).toHaveCount(0)
})

test('an admin resets a password and the user is sent to choose a new one', async ({ page, browser, uniq }) => {
  const email = `${uniq}@test.local`
  const name = `Reset Me ${uniq}`

  await page.goto('/admin/users')
  await page.getByRole('button', { name: 'New user' }).click()
  const form = page.getByRole('form', { name: 'New user' })
  await form.getByLabel('Name').fill(name)
  await form.getByLabel('Work email').fill(email)
  await form.getByRole('button', { name: 'Create user' }).click()
  const first = await takeTemporaryPassword(page)

  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const user = await context.newPage()
  await signIn(user, email, first)
  await choosePassword(user, first, 'FirstChoice123')
  await expect(user).toHaveURL('/tickets')

  // Admin resets it while the user is still signed in
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: `Reset password for ${name}` }).click()
  await expect(page.getByRole('status')).toContainText(`Password reset for ${name}`)
  const second = await takeTemporaryPassword(page)

  // The user's next page load is refused by the backend, so the app sends them to change it
  await user.reload()
  await expect(user).toHaveURL('/change-password')
  await choosePassword(user, second, 'SecondChoice123')
  await expect(user).toHaveURL('/tickets')
  await context.close()
})
