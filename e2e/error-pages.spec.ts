// error-pages.spec.ts – the error screens in a real browser, through the dev-only /__crash pages (the e2e frontend is
// the Vite dev server, so they exist): a page crash keeps the top bar, a crash outside the layout fills the page, and a
// failed code download reloads once and then shows the error screen instead of looping.
import type { Page } from '@playwright/test'
import { expect, test } from './support/fixtures'
import { authFile } from './support/users'

const TITLE = 'Something went wrong'

// The console lines the app's error logger writes ("[TicketFlow] render-route (reference 3FA91C0B, event …)")
function errorLogLines(page: Page) {
  const lines: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error' && message.text().startsWith('[TicketFlow]')) lines.push(message.text())
  })
  return lines
}

// Counts full page loads (the first one included): each time the browser requests the page itself (an HTML document
// for the main frame). Not 'load' events, which Firefox can fire more than once for the same page; a real second reload
// is exactly what these tests must catch.
function countLoads(page: Page) {
  const loads = { count: 0 }
  page.on('request', (request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) loads.count += 1
  })
  return loads
}

async function referenceShown(page: Page) {
  const reference = (await page.locator('.error-fallback__reference code').textContent()) ?? ''
  expect(reference).toMatch(/^[0-9A-F]{8}$/)
  return reference
}

test.describe('logged in', () => {
  test.use({ storageState: authFile('user') })

  test('a page crash shows the error in the page area; the top bar still works', async ({ page }) => {
    const logs = errorLogLines(page)
    await page.goto('/__crash')

    const alert = page.getByRole('alert')
    await expect(alert.getByRole('heading', { name: TITLE })).toBeFocused()
    await expect(alert.getByRole('button', { name: 'Try again' })).toBeVisible()
    await expect(alert.getByRole('button', { name: 'Reload page' })).toHaveCount(0)
    // Development build: the details are there, collapsed
    await expect(alert.getByText('Error details (development only)')).toBeVisible()
    await expect(alert.locator('pre')).toBeHidden()

    // The reference on screen is the one in the log
    const reference = await referenceShown(page)
    await expect
      .poll(() => logs.join('\n'))
      .toContain(`render-route (reference ${reference}, event ${reference.toLowerCase()}`)

    // The top bar works, and the error doesn't follow to the next page
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Tickets', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'My tickets' })).toBeVisible()
    await expect(page.getByText(TITLE)).toHaveCount(0)
  })

  test('"Go to home page" from a page crash opens the ticket list', async ({ page }) => {
    await page.goto('/__crash')
    await page.getByRole('button', { name: 'Go to home page' }).click()
    await expect(page).toHaveURL(/\/tickets$/)
    await expect(page.getByRole('heading', { name: 'My tickets' })).toBeVisible()
  })

  test('a failed code download reloads the page once, then shows the error screen (no loop)', async ({ page }) => {
    const loads = countLoads(page)
    const logs = errorLogLines(page)
    await page.goto('/__crash/chunk')

    await expect(page.getByRole('heading', { name: TITLE })).toBeVisible()
    expect(loads.count).toBe(2) // the visit and one automatic reload
    expect(await page.evaluate(() => Number(sessionStorage.getItem('ticketflow.chunkReloadAt')))).toBeGreaterThan(0)
    expect(logs.filter((line) => line.includes('chunk-reload'))).toHaveLength(1)

    // And it stays put
    await page.waitForTimeout(1500)
    expect(loads.count).toBe(2)
  })
})

test('a crash outside the layout fills the page; Reload and Go to home page are full page loads', async ({ page }) => {
  const loads = countLoads(page)
  await page.goto('/__crash/app')

  const alert = page.getByRole('alert')
  await expect(alert.getByRole('heading', { name: TITLE })).toBeFocused()
  await expect(page.getByRole('navigation')).toHaveCount(0)
  // React Router's own error page never shows
  await expect(page.getByText('Unexpected Application Error')).toHaveCount(0)
  await referenceShown(page)

  await alert.getByRole('button', { name: 'Reload page' }).click()
  await expect.poll(() => loads.count).toBe(2)
  await expect(page.getByRole('heading', { name: TITLE })).toBeVisible()

  // Not logged in, so home ("/" → /tickets) ends on the login page
  await page.getByRole('button', { name: 'Go to home page' }).click()
  await expect(page).toHaveURL(/\/login$/)
  // One more full page load (of "/"); the redirects from there to /login happen inside the app
  expect(loads.count).toBe(3)
})

test('the keyboard reaches the buttons, and Try again works from it', async ({ page }) => {
  await page.goto('/__crash/app')
  await expect(page.getByRole('heading', { name: TITLE })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: 'Try again' })).toBeFocused()
  await page.keyboard.press('Enter')
  // The page throws again, so the screen comes back (focused again) rather than a blank page
  await expect(page.getByRole('heading', { name: TITLE })).toBeFocused()
})
