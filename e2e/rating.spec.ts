// rating.spec.ts – the satisfaction rating against the real backend: the requester closes a resolved ticket and
// rates it, the rating shows on the ticket for staff too, and the admin dashboard counts it.
//
// NEEDS THE BACKEND'S RATINGS (POST /api/tickets/:id/rating, `rating` on GET /api/tickets/:id, `ratings` on
// GET /api/stats), which are Aulona's backend part and not merged yet. Until then a ticket has no `rating` field and
// this test SKIPS ITSELF (the check at the start); once that backend is merged it runs without any change here.
import { API_URL } from './support/target'
import { expect, test } from './support/fixtures'
import { authFile } from './support/users'

test.use({ storageState: authFile('user') })

test('close a resolved ticket, rate it 4 stars with the keyboard; staff see it; Skip leaves "Rate this ticket"', async ({
  page,
  browser,
  api,
  uniq,
}) => {
  // Two browsers (user and admin): slow in Firefox, like hr-flow.spec.ts, so triple the time
  test.slow()
  const rated = await api.createTicket({ title: `${uniq} rated ticket` })
  const probe = await page.request.get(`${API_URL}/tickets/${rated.id}`)
  expect(probe).toBeOK()
  test.skip(
    !('rating' in (await probe.json())),
    "The backend has no ratings yet (Aulona's rating PR); this test needs it",
  )

  // 1. The requester closes the resolved ticket: "How did we do?" opens; 4 stars with the arrow keys, and a comment
  await api.setStatus(rated.id, 'resolved', { resolution: 'Replaced the charger' })
  await page.goto(`/tickets/${rated.id}`)
  await page.getByRole('button', { name: 'Close' }).click()
  const dialog = page.getByRole('dialog', { name: 'How did we do?' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('radio', { name: '1 of 5 stars' })).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await expect(dialog.getByRole('radio', { name: '4 of 5 stars' })).toBeChecked()
  await dialog.getByLabel('Comment').fill(`${uniq} quick and friendly`)
  await dialog.getByRole('button', { name: 'Send' }).click()

  // 2. The rating shows in Details, and there's nothing left to rate (also after a reload)
  await expect(dialog).toBeHidden()
  const details = page.getByRole('heading', { name: 'Details' }).locator('..')
  await expect(details.getByRole('img', { name: '4 of 5 stars' })).toBeVisible()
  await expect(details.getByText(`${uniq} quick and friendly`)).toBeVisible()
  await page.reload()
  await expect(details.getByRole('img', { name: '4 of 5 stars' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Rate this ticket' })).toHaveCount(0)

  // 3. The admin sees the same rating on the ticket, and the dashboard has a Satisfaction card with ratings in it
  const adminContext = await browser.newContext({ storageState: authFile('admin') })
  const admin = await adminContext.newPage()
  await admin.goto(`/tickets/${rated.id}`)
  const adminDetails = admin.getByRole('heading', { name: 'Details' }).locator('..')
  await expect(adminDetails.getByRole('img', { name: '4 of 5 stars' })).toBeVisible()
  await expect(adminDetails.getByText(`${uniq} quick and friendly`)).toBeVisible()
  await admin.goto('/admin')
  const satisfaction = admin.locator('.stat-card', { hasText: 'Satisfaction' })
  await expect(satisfaction).toContainText(/\d\.\d \/ 5/)
  await expect(satisfaction).toContainText(/From \d+ ratings?/)
  await adminContext.close()

  // 4. Skip on another ticket: "Rate this ticket" stays on the page (also after a reload) and rates it later
  const skipped = await api.createTicket({ title: `${uniq} skipped ticket` })
  await api.setStatus(skipped.id, 'resolved', { resolution: 'Restarted the router' })
  await page.goto(`/tickets/${skipped.id}`)
  await page.getByRole('button', { name: 'Close' }).click()
  await page.getByRole('dialog', { name: 'How did we do?' }).getByRole('button', { name: 'Skip' }).click()
  await page.reload()
  await page.getByRole('button', { name: 'Rate this ticket' }).click()
  const again = page.getByRole('dialog', { name: 'How did we do?' })
  // With the mouse this time: a click on the second star
  await again.locator('label', { has: page.getByRole('radio', { name: '2 of 5 stars' }) }).click()
  await expect(again.getByRole('radio', { name: '2 of 5 stars' })).toBeChecked()
  await again.getByRole('button', { name: 'Send' }).click()
  await expect(details.getByRole('img', { name: '2 of 5 stars' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Rate this ticket' })).toHaveCount(0)
})
