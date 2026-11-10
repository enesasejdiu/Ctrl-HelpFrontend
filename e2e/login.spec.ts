// login.spec.ts – signing in through the real form against the real backend. Account lockout: lockout.spec.ts.
import { expect, test } from './support/fixtures'
import { PASSWORD, USERS } from './support/users'

test.describe('Login', () => {
  test('valid credentials land on the ticket list', async ({ page }) => {
    await page.goto('/login')

    await page.getByLabel('Work email').fill(USERS.user.email)
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
    await page.getByRole('button', { name: 'Sign in' }).click()

    // Every role starts on the ticket list; employees see only their own tickets
    await expect(page).toHaveURL('/tickets')
    await expect(page.getByRole('heading', { name: 'My tickets' })).toBeVisible()
  })

  test('a wrong password shows an error and stays on the login page', async ({ page }) => {
    await page.goto('/login')

    await page.getByLabel('Work email').fill(USERS.user.email)
    await page.getByLabel('Password', { exact: true }).fill('not-the-password')
    await page.getByRole('button', { name: 'Sign in' }).click()

    await expect(page.getByRole('alert')).toHaveText('Incorrect email or password.')
    await expect(page).toHaveURL('/login')
  })
})
