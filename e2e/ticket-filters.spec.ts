// ticket-filters.spec.ts – filtering the ticket list. The tickets are created through the API with a unique
// prefix, and the list is narrowed to that prefix first, so other tickets in the database don't matter.
import { expect, test } from './support/fixtures'
import { authFile } from './support/users'

test.use({ storageState: authFile('admin') })

test('filter by status shows only matching tickets', async ({ page, api, uniq }) => {
  const open = await api.createTicket({ title: `${uniq} Printer offline` })
  const working = await api.createTicket({ title: `${uniq} VPN drops`, category: 'Network' })
  await api.setStatus(working.id, 'in_progress')

  const rowFor = (title: string) => page.getByRole('row').filter({ has: page.getByRole('link', { name: title }) })

  await page.goto(`/tickets?q=${uniq}`)
  await expect(rowFor(open.title)).toBeVisible()
  await expect(rowFor(working.title)).toBeVisible()

  await page.getByRole('combobox', { name: 'Status' }).selectOption('In Progress')

  await expect(page).toHaveURL(/status=in_progress/)
  await expect(rowFor(working.title)).toBeVisible()
  await expect(rowFor(open.title)).toBeHidden()
  await expect(page.getByText('Showing 1–1 of 1', { exact: true })).toBeVisible()

  // The filter survives a reload, because it lives in the URL
  await page.reload()
  await expect(page.getByRole('combobox', { name: 'Status' })).toHaveValue('in_progress')
  await expect(rowFor(open.title)).toBeHidden()
})
