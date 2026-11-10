// not-found.spec.ts – "Page not found" in a real browser: logged out it shows without a detour to /login, logged in it
// sits inside the layout, a missing ticket shows it in place, and real routes still load (also on reload).
import { expect, test } from './support/fixtures'
import { authFile } from './support/users'

const TITLE = 'Page not found'

test('logged out: an unknown URL shows "Page not found" (no redirect to login); home is the login page', async ({
  page,
}) => {
  await page.goto('/admin/usres')
  await expect(page.getByRole('heading', { level: 1, name: TITLE })).toBeFocused()
  await expect(page.getByText("We couldn't find /admin/usres")).toBeVisible()
  await expect(page).toHaveURL(/\/admin\/usres$/)
  await expect(page.getByRole('navigation')).toHaveCount(0)
  await expect(page).toHaveTitle('Page not found – TicketFlow')
  await expect(page.locator('meta[name="robots"][content="noindex"]')).toHaveCount(1)
  // Opened directly: nothing in the app to go back to
  await expect(page.getByRole('button', { name: 'Go back' })).toHaveCount(0)

  await page.getByRole('link', { name: 'Go to home page' }).click()
  await expect(page).toHaveURL(/\/login$/)
  await expect(page).toHaveTitle('TicketFlow')
  await expect(page.locator('meta[name="robots"]')).toHaveCount(0)
})

test('a protected page while logged out still goes to login', async ({ page }) => {
  await page.goto('/tickets/new')
  await expect(page).toHaveURL(/\/login$/)
})

test.describe('logged in', () => {
  test.use({ storageState: authFile('user') })

  test('an unknown URL shows "Page not found" inside the layout', async ({ page }) => {
    await page.goto('/tickets/new/oops')
    await expect(page.getByRole('heading', { level: 1, name: TITLE })).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible()
    await page.getByRole('link', { name: 'Go to home page' }).click()
    await expect(page.getByRole('heading', { name: 'My tickets' })).toBeVisible()
  })

  test("a ticket that doesn't exist shows the same page, with its own message", async ({ page }) => {
    await page.goto('/tickets/99999999')
    await expect(page.getByRole('heading', { level: 1, name: TITLE })).toBeVisible()
    await expect(page.getByText("This ticket doesn't exist or has been removed.")).toBeVisible()
    await expect(page.getByText('Loading ticket…')).toHaveCount(0)
  })

  test('a path with markup is shown as text', async ({ page }) => {
    let dialogs = 0
    page.on('dialog', (dialog) => {
      dialogs += 1
      void dialog.dismiss()
    })
    await page.goto('/%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E')
    await expect(page.locator('.not-found__path code')).toHaveText('/<img src=x onerror=alert(1)>')
    await expect(page.locator('.not-found img')).toHaveCount(0)
    expect(dialogs).toBe(0)
  })

  test('a deep link to a real page loads it, also after a reload', async ({ page }) => {
    await page.goto('/tickets/new')
    await expect(page.getByRole('heading', { level: 1, name: 'New ticket' })).toBeVisible()
    await page.reload()
    await expect(page.getByRole('heading', { level: 1, name: 'New ticket' })).toBeVisible()
    await expect(page.getByText(TITLE)).toHaveCount(0)
  })
})
