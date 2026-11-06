// protected-route.spec.ts – pages that need a login (or a role) send other visitors away.
import { expect, test } from './support/fixtures'
import { PASSWORD, USERS, authFile } from './support/users'

test.describe('Protected routes', () => {
  test('a logged-out visitor is sent to /login, and back after signing in', async ({ page }) => {
    await page.goto('/tickets/new')

    await expect(page).toHaveURL('/login')
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()

    await page.getByLabel('Work email').fill(USERS.user.email)
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
    await page.getByRole('button', { name: 'Sign in' }).click()

    await expect(page).toHaveURL('/tickets/new')
    await expect(page.getByRole('heading', { name: 'New ticket' })).toBeVisible()
  })

  test.describe('as an employee', () => {
    test.use({ storageState: authFile('user') })

    test('the admin pages redirect to the ticket list', async ({ page }) => {
      await page.goto('/admin/users')

      await expect(page).toHaveURL('/tickets')
      await expect(page.getByRole('heading', { name: 'My tickets' })).toBeVisible()
    })
  })
})
