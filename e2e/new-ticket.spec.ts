// new-ticket.spec.ts – reporting a problem through the form, then finding it in the list.
import { expect, test } from './support/fixtures'
import { authFile } from './support/users'

test.use({ storageState: authFile('user') })

test('create a ticket through the form and see it in the list', async ({ page, uniq }) => {
  const title = `${uniq} Laptop will not boot`

  await page.goto('/tickets/new')
  await page.getByRole('textbox', { name: 'Title' }).fill(title)
  await page.getByRole('combobox', { name: 'Category' }).selectOption('Hardware')
  // Priorities are cards with a hidden radio inside; click the card like a user does
  const priority = page.getByRole('group', { name: 'Priority' })
  await priority.getByText('High', { exact: true }).click()
  await expect(priority.getByRole('radio', { name: /High/ })).toBeChecked()
  await page.getByRole('textbox', { name: 'Description' }).fill('Black screen since this morning, fans spin.')
  await page.getByRole('button', { name: 'Submit ticket' }).click()

  // Lands on the new ticket's page
  await expect(page).toHaveURL(/\/tickets\/\d+$/)
  await expect(page.getByRole('heading', { name: title })).toBeVisible()

  // …and it's in "My tickets", with the chosen status and priority
  await page.getByRole('link', { name: 'Back to tickets' }).click()
  await page.getByRole('searchbox', { name: 'Search tickets' }).fill(uniq)
  const row = page.getByRole('row').filter({ has: page.getByRole('link', { name: title }) })
  await expect(row).toBeVisible()
  await expect(row.getByText('Open')).toBeVisible()
  await expect(row.getByText('High')).toBeVisible()
  await expect(page.getByText('Showing 1–1 of 1', { exact: true })).toBeVisible()
})
