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

  test('the session is an httpOnly cookie: no token in localStorage, and a reload stays logged in', async ({
    page,
    context,
  }) => {
    await page.goto('/login')
    await page.getByLabel('Work email').fill(USERS.user.email)
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByRole('heading', { name: 'My tickets' })).toBeVisible()

    expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([])
    const cookies = Object.fromEntries((await context.cookies()).map((cookie) => [cookie.name, cookie]))
    expect(cookies.tf_session?.httpOnly).toBe(true)
    expect(cookies.tf_csrf?.httpOnly).toBe(false)
    // Scripts can read tf_csrf (to send it as X-CSRF-Token) but never tf_session
    const readable = await page.evaluate(() => document.cookie)
    expect(readable).toContain('tf_csrf=')
    expect(readable).not.toContain('tf_session')

    await page.reload()
    await expect(page.getByRole('heading', { name: 'My tickets' })).toBeVisible()
  })

  test('logging out ends the session: a reload goes to the login page', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Work email').fill(USERS.user.email)
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByRole('heading', { name: 'My tickets' })).toBeVisible()

    await page.getByRole('button', { name: 'Log out' }).click()
    await expect(page).toHaveURL(/\/login/)
    await page.goto('/tickets')
    await expect(page).toHaveURL(/\/login/)
  })

  test('a wrong password shows an error and stays on the login page', async ({ page }) => {
    await page.goto('/login')

    await page.getByLabel('Work email').fill(USERS.user.email)
    await page.getByLabel('Password', { exact: true }).fill('not-the-password')
    await page.getByRole('button', { name: 'Sign in' }).click()

    await expect(page.getByRole('alert')).toHaveText('Wrong email or password')
    await expect(page).toHaveURL('/login')
  })
})
