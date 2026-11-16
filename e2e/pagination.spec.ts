// @local-only: not in the staging run (playwright.staging.config.ts): guarded to a throwaway local database; makes 60 tickets that would stay on staging.
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

// Only ever this run's throwaway database, on a local server unless E2E_DB_HOST names another one on purpose
function assertThrowawayDatabase() {
  assertE2eDbName(DB_NAME)
  if (!process.env.E2E_DB_HOST && !LOCAL_HOSTS.includes(DB_SERVER.host)) {
    throw new Error(`Refusing to run: the e2e database server is "${DB_SERVER.host}", not a local one`)
  }
}

// Firefox can take several seconds to load and draw a page (the first load in a new page especially) on a busy
// machine or runner; the checks in the tests below stay the same, each just gets 15 s, like the slow steps in
// forgot-password.spec.ts
const pageExpect = expect.configure({ timeout: 15_000 })

test('a reload keeps the page and the sort; priority sorts both ways on every page', async ({ page, api, uniq }) => {
  test.slow()
  assertThrowawayDatabase()
  const probe = await api.get('tickets?page=1&pageSize=25')
  test.skip(Array.isArray(probe), 'The backend does not page GET /api/tickets yet')

  for (let i = 1; i <= 30; i += 1) {
    await api.createTicket({ title: `${uniq} reload ${String(i).padStart(2, '0')}`, priority: PRIORITIES[i % 4] })
  }

  await page.goto(`/tickets?q=${uniq}&sort=priority&order=asc&page=2`)
  const pager = page.getByRole('navigation', { name: 'Ticket pages' })
  const priorityHeader = page.getByRole('columnheader', { name: /^Priority/ })
  await pageExpect(page.getByText('Showing 26–30 of 30')).toBeVisible()
  await pageExpect(priorityHeader).toHaveAttribute('aria-sort', 'ascending')
  // Ascending: the second page holds the most urgent ones
  await pageExpect(page.locator('tbody tr').last()).toContainText('Critical')

  await page.reload()
  await pageExpect(page).toHaveURL(/sort=priority/)
  await pageExpect(page).toHaveURL(/order=asc/)
  await pageExpect(page).toHaveURL(/[?&]page=2(&|$)/)
  await pageExpect(page.getByText('Showing 26–30 of 30')).toBeVisible()
  await pageExpect(priorityHeader).toHaveAttribute('aria-sort', 'ascending')
  await pageExpect(pager.getByText('Page 2 of 2')).toBeVisible()
  await pageExpect(pager.getByRole('button', { name: 'Next' })).toBeDisabled()

  // Flip to descending: back to page 1, most urgent first; reload keeps that too
  await priorityHeader.getByRole('button').click()
  await pageExpect(page).toHaveURL(/order=desc/)
  await pageExpect(page).not.toHaveURL(/[?&]page=/)
  await pageExpect(page.locator('tbody tr').first()).toContainText('Critical')
  await pager.getByRole('button', { name: 'Next' }).click()
  await pageExpect(page).toHaveURL(/[?&]page=2(&|$)/)
  await pageExpect(page.locator('tbody tr').last()).toContainText('Low')
  await page.reload()
  await pageExpect(priorityHeader).toHaveAttribute('aria-sort', 'descending')
  await pageExpect(page.getByText('Showing 26–30 of 30')).toBeVisible()
  await pageExpect(page.locator('tbody tr').last()).toContainText('Low')
  await pageExpect(pager.getByRole('button', { name: 'Previous' })).toBeEnabled()
})

test.describe('the users page', () => {
  test.use({ storageState: authFile('admin') })

  test('pages, sorts by a column both ways, and a reload keeps both', async ({ page, api, uniq }) => {
    test.slow()
    assertThrowawayDatabase()
    const probe = await api.get('users?page=1&pageSize=25', 'admin')
    test.skip(Array.isArray(probe), 'The backend does not page GET /api/users yet')

    // Enough accounts for two pages (40), counting what other tests created before; only the missing ones are added,
    // so repeated runs on the same database (CI repeats this file) don't keep making the list longer and slower.
    // Named to sort last (the list is A–Z by name by default), so later tests that look for their own new account on
    // page 1 still find it there
    const missing = Math.max(0, 40 - probe.total)
    for (let i = 1; i <= missing; i += 1) {
      await api.createEmployee(`Zz Paging ${uniq} ${String(i).padStart(2, '0')}`, `zz.${uniq}.${i}@e2e.test`)
    }
    const first = await api.get('users?page=1&pageSize=25&sort=email&order=asc', 'admin')
    const pages = Math.ceil(first.total / 25)
    const lastByEmail = await api.get(`users?page=${pages}&pageSize=25&sort=email&order=desc`, 'admin')
    expect(first.total).toBeGreaterThan(25)

    await page.goto('/admin/users')
    const pager = page.getByRole('navigation', { name: 'User pages' })
    await pageExpect(page.getByText(new RegExp(`^Showing 1–25 of ${first.total}`))).toBeVisible()
    await pageExpect(pager.getByText(`Page 1 of ${pages}`)).toBeVisible()
    await pageExpect(pager.getByRole('button', { name: 'Previous' })).toBeDisabled()

    await pager.getByRole('button', { name: 'Next' }).click()
    await pageExpect(page).toHaveURL(/[?&]page=2(&|$)/)
    await pageExpect(pager.getByText(`Page 2 of ${pages}`)).toBeVisible()

    // Sorting by Email goes back to page 1, A–Z first, then Z–A
    const emailHeader = page.getByRole('columnheader', { name: /^Email/ })
    await emailHeader.getByRole('button').click()
    await pageExpect(page).toHaveURL(/sort=email&order=asc/)
    await pageExpect(page).not.toHaveURL(/[?&]page=/)
    await pageExpect(emailHeader).toHaveAttribute('aria-sort', 'ascending')
    await pageExpect(page.locator('tbody tr').first()).toContainText(first.items[0].email)

    await emailHeader.getByRole('button').click()
    await pageExpect(page).toHaveURL(/sort=email&order=desc/)
    await pageExpect(emailHeader).toHaveAttribute('aria-sort', 'descending')

    // The last page, Z–A, survives a reload
    await page.goto(`/admin/users?sort=email&order=desc&page=${pages}`)
    await pageExpect(pager.getByText(`Page ${pages} of ${pages}`)).toBeVisible()
    await page.reload()
    await pageExpect(pager.getByText(`Page ${pages} of ${pages}`)).toBeVisible()
    await pageExpect(emailHeader).toHaveAttribute('aria-sort', 'descending')
    await pageExpect(pager.getByRole('button', { name: 'Next' })).toBeDisabled()
    await pageExpect(page.locator('tbody tr').last()).toContainText(lastByEmail.items.at(-1).email)

    // Page size 50: back to page 1, and the sort stays
    await pager.getByLabel('Per page').selectOption('50')
    await pageExpect(page).toHaveURL(/pageSize=50/)
    await pageExpect(page).not.toHaveURL(/[?&]page=/)
    await pageExpect(page).toHaveURL(/sort=email&order=desc/)
    await pageExpect(
      page.getByText(new RegExp(`^Showing 1–${Math.min(50, first.total)} of ${first.total}`)),
    ).toBeVisible()
  })
})
