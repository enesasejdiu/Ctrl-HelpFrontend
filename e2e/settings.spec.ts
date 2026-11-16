// settings.spec.ts – the admin Settings page against the real backend.
//
// NEEDS THE BACKEND'S SETTINGS API (GET/PATCH /api/settings, GET /api/settings/public, POST/PATCH/DELETE
// /api/categories, PATCH /api/priorities/:id), which is Aulona's backend part and not merged yet. Until then
// /api/settings/public is a 404 and this test SKIPS ITSELF (the check at the start); once that backend is merged it
// runs without any change here.
import { API_URL } from '../scripts/e2e-env.mjs'
import { expect, test } from './support/fixtures'
import { authFile } from './support/users'

test.use({ storageState: authFile('admin') })

test('rename the company, add and archive a category, and set High to 12 hours', async ({
  page,
  browser,
  request,
  api,
  uniq,
}) => {
  const probe = await request.get(`${API_URL}/settings/public`)
  test.skip(probe.status() === 404, "The backend has no settings API yet (Aulona's settings PR); this test needs it")

  const original = (await probe.json()).company_name ?? ''
  const company = `${uniq} Corp`
  const category = `${uniq} Badges`
  const highHours = page.getByLabel('Target time (hours) for High')
  let originalHigh = ''

  try {
    // 1. Rename the company: the top bar shows it, and so does the login page
    await page.goto('/admin/settings')
    const companyCard = page.getByRole('region', { name: 'Company' })
    await companyCard.getByLabel('Company name').fill(company)
    await companyCard.getByRole('button', { name: 'Save' }).click()
    await expect(companyCard.getByRole('status')).toHaveText('Saved')
    await expect(page.locator('.topbar__brand')).toContainText(company)

    const visitor = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    const loginPage = await visitor.newPage()
    await loginPage.goto('/login')
    await expect(loginPage.getByText(company).first()).toBeVisible()
    await visitor.close()

    // 2. Add a category: New ticket offers it
    const categories = page.getByRole('region', { name: 'Categories' })
    await categories.getByRole('button', { name: 'Add category' }).click()
    const dialog = page.getByRole('dialog', { name: 'Add category' })
    await dialog.getByLabel('Name').fill(category)
    await dialog.getByRole('button', { name: 'Add category' }).click()
    await expect(categories.getByText(category)).toBeVisible()

    await page.goto('/tickets/new')
    await expect(page.getByRole('combobox', { name: 'Category' }).getByRole('option', { name: category })).toHaveCount(
      1,
    )

    // 3. Archive it: New ticket doesn't offer it any more
    await page.goto('/admin/settings')
    await page.getByRole('button', { name: `Archive ${category}` }).click()
    await expect(page.getByRole('button', { name: `Restore ${category}` })).toBeVisible()
    await page.goto('/tickets/new')
    await expect(page.getByRole('combobox', { name: 'Category' }).getByRole('option', { name: category })).toHaveCount(
      0,
    )

    // 4. High → 12 hours: a High ticket's target time shows it
    await page.goto('/admin/settings')
    originalHigh = await highHours.inputValue()
    await highHours.fill('12')
    await page.getByRole('button', { name: 'Save High' }).click()
    await expect(highHours.locator('xpath=ancestor::li').getByRole('status')).toHaveText('Saved')

    const ticket = await api.createTicket({ title: `${uniq} High ticket`, priority: 'High', as: 'admin' })
    await page.goto(`/tickets/${ticket.id}`)
    const details = page.getByRole('heading', { name: 'Details' }).locator('..')
    await expect(details.getByText('Target time').locator('..')).toContainText('12 hours')
  } finally {
    // Put the shared settings back for the other tests in this run
    await page.goto('/admin/settings')
    const companyField = page.getByRole('region', { name: 'Company' }).getByLabel('Company name')
    if ((await companyField.inputValue()) !== original && original) {
      await companyField.fill(original)
      await page.getByRole('region', { name: 'Company' }).getByRole('button', { name: 'Save' }).click()
    }
    if (originalHigh && (await highHours.inputValue()) !== originalHigh) {
      await highHours.fill(originalHigh)
      await page.getByRole('button', { name: 'Save High' }).click()
    }
  }
})
