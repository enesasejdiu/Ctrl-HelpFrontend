// kb.spec.ts – the knowledge base's main flow, against the real backend: staff write a draft in the editor; an
// employee can neither open it nor find it; staff publish it; the employee finds it through search (the word marked)
// and opens it. The test makes its own category through the API (named with its unique prefix) and deletes the
// article and the category at the end, so it relies on no seeded articles and leaves nothing behind: it runs the same
// locally and against staging.
import { expect, test } from './support/fixtures'
import { authFile } from './support/users'

// Staff here is the admin (IT staff too); the employee gets a browser context of their own
test.use({ storageState: authFile('admin') })

test('a draft is hidden from employees until it is published, then found by search', async ({
  page,
  browser,
  api,
  uniq,
}) => {
  // One word nobody else's article has (letters and digits only, so the full-text search keeps it whole)
  const word = `kbword${uniq.replace(/[^a-z0-9]/gi, '')}`.toLowerCase()
  const title = `${uniq} Connect to the office VPN`
  const category: { id: number; name: string } = await api.send('post', 'kb/categories', 'admin', {
    name: `${uniq} Network`,
  })
  const employee = await browser.newContext({ storageState: authFile('user') })
  const reader = await employee.newPage()
  let articleId: number | undefined

  try {
    // Staff write the draft
    await page.goto('/kb/new')
    await page.getByLabel('Title').fill(title)
    await page.getByLabel('Category').selectOption({ label: category.name })
    await page.getByLabel('Summary').fill(`How to reach the office network from home (${word})`)
    await page.getByLabel('Article', { exact: true }).fill(`## Steps\n\nOpen the VPN app and sign in. ${word}`)
    // The live preview shows the formatted text
    await expect(page.getByRole('region', { name: 'Preview' }).getByRole('heading', { name: 'Steps' })).toBeVisible()
    await page.getByRole('button', { name: 'Save draft' }).click()
    await expect(page).toHaveURL(/\/kb\/[a-z0-9-]+\/edit$/)
    const slug = new URL(page.url()).pathname.split('/')[2]
    const saved: { id: number; status: string } = await api.get(`kb/articles/${slug}`, 'admin')
    articleId = saved.id
    expect(saved.status).toBe('draft')

    // The employee can't open the draft, and search doesn't find it
    await reader.goto(`/kb/${slug}`)
    await expect(reader.getByText("This article doesn't exist or has been removed.")).toBeVisible()
    await reader.goto(`/kb/search?q=${word}`)
    await expect(reader.getByText(`No articles match “${word}”.`)).toBeVisible()

    // Staff publish it, which opens the article
    await page.getByRole('button', { name: 'Publish' }).click()
    await expect(page).toHaveURL(new RegExp(`/kb/${slug}$`))
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible()

    // The employee searches from the knowledge base home, sees the word marked, and opens the article
    await reader.goto('/kb')
    await reader.getByRole('searchbox', { name: 'Search the knowledge base' }).fill(word)
    await reader.getByRole('button', { name: 'Search' }).click()
    await expect(reader).toHaveURL(new RegExp(`/kb/search\\?q=${word}$`))
    await expect(reader.getByText(`1 article for “${word}”`)).toBeVisible()
    const results = reader.getByRole('list', { name: 'Search' })
    await expect(results.locator('mark').filter({ hasText: word })).toHaveCount(1)
    await results.getByRole('link', { name: title }).click()
    await expect(reader).toHaveURL(new RegExp(`/kb/${slug}$`))
    await expect(reader.getByRole('heading', { level: 1, name: title })).toBeVisible()
    await expect(reader.getByRole('heading', { level: 2, name: 'Steps' })).toBeVisible()
    await expect(reader.getByRole('link', { name: 'Edit' })).toHaveCount(0)
  } finally {
    await employee.close()
    if (articleId) await api.send('delete', `kb/articles/${articleId}`, 'admin')
    await api.send('delete', `kb/categories/${category.id}`, 'admin')
  }
})
