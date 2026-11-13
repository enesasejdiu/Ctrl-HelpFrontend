// privacy.spec.ts – the Privacy page in a real browser: open without signing in (from the login page), and from the
// footer once signed in; readable at phone width (no sideways scrolling).
import { expect, test } from './support/fixtures'
import { authFile } from './support/users'

test.describe('logged out', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('the login page links to Privacy, which opens without signing in', async ({ page }, info) => {
    await page.goto('/login')
    await page.getByRole('link', { name: 'Privacy' }).click()

    await expect(page).toHaveURL('/privacy')
    await expect(page.getByRole('heading', { level: 1, name: 'Privacy' })).toBeVisible()
    await expect(page.getByText('[to be completed by your company: company name and address]')).toBeVisible()
    await page.screenshot({ path: info.outputPath('privacy-desktop.png'), fullPage: true })

    await page.setViewportSize({ width: 375, height: 800 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await page.screenshot({ path: info.outputPath('privacy-phone.png') })

    await page.getByRole('link', { name: 'Back to sign in' }).click()
    await expect(page).toHaveURL('/login')
  })
})

test.describe('logged in', () => {
  test.use({ storageState: authFile('user') })

  test('every page has a footer with the Privacy link', async ({ page }, info) => {
    await page.goto('/tickets')
    const footer = page.getByRole('contentinfo')
    await expect(footer).toBeVisible()
    await page.screenshot({ path: info.outputPath('tickets-footer.png'), fullPage: true })
    await footer.getByRole('link', { name: 'Privacy' }).click()

    await expect(page).toHaveURL('/privacy')
    await page.getByRole('link', { name: 'Back to TicketFlow' }).click()
    await expect(page).toHaveURL('/tickets')
  })
})
