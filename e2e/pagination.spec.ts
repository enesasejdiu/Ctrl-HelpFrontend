// pagination.spec.ts – paging and sorting on the ticket list against the real backend.
//
// NEEDS THE BACKEND'S PAGINATION (GET /api/tickets?page=&pageSize=&sort=&order= answering { items, total, page,
// pageSize }), which is Aulona's backend part and not merged yet. Until then the backend answers with a plain array
// and this test SKIPS ITSELF (see the check at the start); once that backend is merged it runs without any change here.
import { expect, test } from './support/fixtures'
import { authFile } from './support/users'

test.use({ storageState: authFile('user') })

const PRIORITIES = ['Low', 'Medium', 'High', 'Critical'] as const

test('30 tickets: page through them, sort by priority, and a filter goes back to page 1', async ({
  page,
  api,
  uniq,
}) => {
  const probe = await api.get('tickets?page=1&pageSize=25')
  test.skip(
    Array.isArray(probe),
    "The backend does not page GET /api/tickets yet (Aulona's backend pagination PR); this test needs it",
  )

  // 30 tickets of this test only (the search for `uniq` keeps other tests' tickets out), priorities taking turns
  for (let i = 1; i <= 30; i += 1) {
    await api.createTicket({ title: `${uniq} ticket ${String(i).padStart(2, '0')}`, priority: PRIORITIES[i % 4] })
  }

  await page.goto(`/tickets?q=${uniq}`)
  await expect(page.getByText('Showing 1–25 of 30')).toBeVisible()
  const pager = page.getByRole('navigation', { name: 'Ticket pages' })
  await expect(pager.getByText('Page 1 of 2')).toBeVisible()
  await expect(page.locator('tbody tr')).toHaveCount(25)

  // Next page, kept in the URL (and still there after a reload)
  await pager.getByRole('button', { name: 'Next' }).click()
  await expect(page).toHaveURL(/[?&]page=2(&|$)/)
  await expect(page.getByText('Showing 26–30 of 30')).toBeVisible()
  await page.reload()
  await expect(page.getByText('Showing 26–30 of 30')).toBeVisible()

  // Sort by priority: most urgent first, back to page 1
  const priorityHeader = page.getByRole('columnheader', { name: /^Priority/ })
  await priorityHeader.getByRole('button').click()
  await expect(page).toHaveURL(/sort=priority&order=desc/)
  await expect(page).not.toHaveURL(/[?&]page=/)
  await expect(priorityHeader).toHaveAttribute('aria-sort', 'descending')
  await expect(page.locator('tbody tr').first()).toContainText('Critical')

  // On page 2, a filter goes back to page 1 (and keeps the sort)
  await pager.getByRole('button', { name: 'Next' }).click()
  await expect(page).toHaveURL(/[?&]page=2(&|$)/)
  await page.getByRole('combobox', { name: 'Priority' }).selectOption('Low')
  await expect(page).not.toHaveURL(/[?&]page=/)
  await expect(page).toHaveURL(/sort=priority/)
  await expect(page.getByText('Showing 1–7 of 7')).toBeVisible()
})
