// similar-suggestions.spec.ts – while an employee types a new ticket's title, a matching help article shows under it;
// it opens in a new tab, and the ticket being written is still there. The test publishes its own article (in its own
// category, named with its unique prefix) through the API and deletes both at the end, so it runs the same locally
// and against staging.
import { expect, test } from './support/fixtures'
import { authFile } from './support/users'

test.use({ storageState: authFile('user') })

test('an employee finds a help article while typing, opens it in a new tab, and keeps the draft', async ({
  page,
  context,
  api,
  uniq,
}) => {
  const category: { id: number } = await api.send('post', 'kb/categories', 'admin', { name: `${uniq} Printers` })
  const title = `Printer not printing (${uniq})`
  const article: { id: number; slug: string } = await api.send('post', 'kb/articles', 'admin', {
    title,
    summary: 'Check the print queue and restart the printer.',
    body: '## Steps\n\nOpen the print queue, cancel stuck jobs, then turn the printer off and on.',
    category_id: category.id,
    status: 'published',
  })

  try {
    await page.goto('/tickets/new')
    const titleField = page.getByRole('textbox', { name: 'Title' })
    await titleField.fill('printer not working')
    await page.getByRole('textbox', { name: 'Description' }).fill('Nothing comes out since this morning.')

    const panel = page.getByRole('region', { name: 'Is this the same problem?' })
    const articles = panel.getByRole('list', { name: 'Help articles' })
    const link = articles.getByRole('link', { name: new RegExp(uniq) })
    await expect(link).toBeVisible()
    await expect(link.locator('mark').first()).toHaveText('Printer')

    // Opens in a new tab, on the article
    const [tab] = await Promise.all([context.waitForEvent('page'), link.click()])
    await expect(tab).toHaveURL(new RegExp(`/kb/${article.slug}$`))
    await expect(tab.getByRole('heading', { level: 1, name: title })).toBeVisible()
    await tab.close()

    // The ticket being written is untouched
    await expect(page).toHaveURL(/\/tickets\/new$/)
    await expect(titleField).toHaveValue('printer not working')
    await expect(page.getByRole('textbox', { name: 'Description' })).toHaveValue(
      'Nothing comes out since this morning.',
    )
  } finally {
    await api.send('delete', `kb/articles/${article.id}`, 'admin')
    await api.send('delete', `kb/categories/${category.id}`, 'admin')
  }
})
