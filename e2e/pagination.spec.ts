// pagination.spec.ts – paging and sorting on the ticket list against the real backend.
//
// NEEDS THE BACKEND'S PAGINATION (GET /api/tickets?page=&pageSize=&sort=&order= answering { items, total, page,
// pageSize }; enesasejdiu/Ctrl-HelpBackend#46). Against a backend without it the answer is a plain array and this
// test SKIPS ITSELF (see the check at the start).
// It writes 30 tickets, so it first makes sure it runs on this run's throwaway database and stops otherwise.
import { assertE2eDbName, DB_NAME, DB_SERVER } from '../scripts/e2e-env.mjs'
import { expect, test } from './support/fixtures'
import { authFile } from './support/users'

test.use({ storageState: authFile('user') })

const PRIORITIES = ['Low', 'Medium', 'High', 'Critical'] as const
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '::1']

test('30 tickets: page through them, sort by priority, and a filter goes back to page 1', async ({
  page,
  api,
  uniq,
}) => {
  // 30 API calls plus the browser steps: more than the default 30 seconds on a busy machine
  test.slow()

  // Only ever this run's throwaway database (ticketflow_e2e_<time>_<pid>), on a local server unless E2E_DB_HOST names
  // another one on purpose. Anything else: stop before writing a single ticket.
  assertE2eDbName(DB_NAME)
  if (!process.env.E2E_DB_HOST && !LOCAL_HOSTS.includes(DB_SERVER.host)) {
    throw new Error(`Refusing to run: the e2e database server is "${DB_SERVER.host}", not a local one`)
  }

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
  await pager.getByRole('button', { name: 'Next' }).click()
  await expect(page.getByText('Showing 26–30 of 30')).toBeVisible()
  await expect(page.locator('tbody tr').last()).toContainText('Low')

  // Again: least urgent first, back to page 1
  await priorityHeader.getByRole('button').click()
  await expect(page).toHaveURL(/sort=priority&order=asc/)
  await expect(page).not.toHaveURL(/[?&]page=/)
  await expect(priorityHeader).toHaveAttribute('aria-sort', 'ascending')
  await expect(page.locator('tbody tr').first()).toContainText('Low')
  await pager.getByRole('button', { name: 'Next' }).click()
  await expect(page.locator('tbody tr').last()).toContainText('Critical')
  await pager.getByRole('button', { name: 'Previous' }).click()
  await expect(page.getByText('Showing 1–25 of 30')).toBeVisible()

  // On page 2, a filter goes back to page 1 (and keeps the sort)
  await pager.getByRole('button', { name: 'Next' }).click()
  await expect(page).toHaveURL(/[?&]page=2(&|$)/)
  await page.getByRole('combobox', { name: 'Priority' }).selectOption('Low')
  await expect(page).not.toHaveURL(/[?&]page=/)
  await expect(page).toHaveURL(/sort=priority/)
  await expect(page.getByText('Showing 1–7 of 7')).toBeVisible()
})
