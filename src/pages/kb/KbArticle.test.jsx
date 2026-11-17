// KbArticle.test.jsx – /kb/:slug: the article (rendered and sanitized), "Updated … by …", the table of contents,
// "More in <category>", staff extras, and the loading, not-found and error states.
import { screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { buildArticle, buildCategory, mockKb } from '../../test/kbBackend'
import { buildUser } from '../../test/factories'
import { renderWithProviders } from '../../test/render'
import { API, deferred, server } from '../../test/server'
import KbArticle from './KbArticle'

const employee = buildUser({ role: 'employee' })
const agent = buildUser({ id: 7, role: 'agent' })
const email = buildCategory({ id: 1, name: 'Email' })

const render = (slug, user = employee) =>
  renderWithProviders(<KbArticle />, { route: `/kb/${slug}`, path: '/kb/:slug', user })

test('the title, category link, who updated it and when, and the formatted text', async () => {
  mockKb({
    categories: [email],
    articles: [
      buildArticle({
        title: 'Set up mail on a phone',
        category: email,
        body: '## Steps\n\nOpen **Settings**.',
        updated_at: '2026-11-10T09:00:00.000Z',
        updated_by: { id: 8, name: 'Drita Berisha' },
      }),
    ],
  })
  await render('set-up-mail-on-a-phone')
  expect(await screen.findByRole('heading', { level: 1, name: 'Set up mail on a phone' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Email' })).toHaveAttribute('href', '/kb/c/email')
  expect(screen.getByText(/^Updated .* by Drita Berisha$/)).toBeInTheDocument()
  expect(screen.getByRole('heading', { level: 2, name: 'Steps' })).toHaveAttribute('id', 'steps')
  expect(screen.getByText('Settings').tagName).toBe('STRONG')
})

test('anything unsafe in the article never becomes an element', async () => {
  mockKb({
    categories: [email],
    articles: [
      buildArticle({
        title: 'Unsafe content',
        category: email,
        body: '<script>alert(1)</script>\n\n<img src=x onerror="alert(1)">\n\n[click](javascript:alert(1))\n\n<iframe src="https://evil.example"></iframe>\n\n[site](https://example.org)',
      }),
    ],
  })
  const { container } = await render('unsafe-content')
  await screen.findByRole('heading', { level: 1, name: 'Unsafe content' })
  const prose = container.querySelector('.kb-prose')
  expect(prose.querySelectorAll('script, img, iframe')).toHaveLength(0)
  expect(within(prose).queryByRole('link', { name: 'click' })).not.toBeInTheDocument()
  // The links that are left are web addresses (the one written, and the iframe's address, shown as text and
  // auto-linked), opening a new tab safely
  const links = within(prose).getAllByRole('link')
  expect(within(prose).getByRole('link', { name: 'site' })).toHaveAttribute('href', 'https://example.org')
  for (const link of links) {
    expect(link.getAttribute('href')).toMatch(/^https:\/\//)
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  }
})

test('a table of contents with 3 or more headings, linking to them; none with 2', async () => {
  mockKb({
    categories: [email],
    articles: [
      buildArticle({ title: 'Three headings', category: email, body: '## One\n\n## Two\n\n### Two point one' }),
      buildArticle({ title: 'Two headings', category: email, body: '## One\n\n## Two' }),
    ],
  })
  await render('three-headings')
  const toc = await screen.findByRole('navigation', { name: 'On this page' })
  expect(
    within(toc)
      .getAllByRole('link')
      .map((a) => [a.textContent, a.getAttribute('href')]),
  ).toEqual([
    ['One', '#one'],
    ['Two', '#two'],
    ['Two point one', '#two-point-one'],
  ])
})

test('no table of contents with fewer than 3 headings', async () => {
  mockKb({
    categories: [email],
    articles: [buildArticle({ title: 'Two headings', category: email, body: '## A\n\n## B' })],
  })
  await render('two-headings')
  await screen.findByRole('heading', { level: 1, name: 'Two headings' })
  expect(screen.queryByRole('navigation', { name: 'On this page' })).not.toBeInTheDocument()
})

test('"More in <category>": up to 5 other published articles of the category, not this one', async () => {
  mockKb({
    categories: [email],
    articles: [
      buildArticle({ title: 'Main article', category: email }),
      ...Array.from({ length: 6 }, (_, i) => buildArticle({ title: `Other ${i + 1}`, category: email })),
    ],
  })
  await render('main-article')
  const more = await screen.findByRole('region', { name: 'More in Email' })
  const titles = within(more)
    .getAllByRole('link')
    .map((a) => a.textContent)
  expect(titles).toHaveLength(5)
  expect(titles).not.toContain('Main article')
})

test('an unknown article, and a draft for a non-staff reader, show "not found"', async () => {
  mockKb({ categories: [email], articles: [buildArticle({ title: 'Secret draft', category: email, status: 'draft' })] })
  await render('secret-draft')
  expect(await screen.findByText("This article doesn't exist or has been removed.")).toBeInTheDocument()
})

test('staff see a draft, marked as such, with an Edit button', async () => {
  mockKb({ categories: [email], articles: [buildArticle({ title: 'Secret draft', category: email, status: 'draft' })] })
  await render('secret-draft', agent)
  expect(await screen.findByText('This is a draft: only IT staff can see it.')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Edit' })).toHaveAttribute('href', '/kb/secret-draft/edit')
})

test('employees get no Edit button', async () => {
  mockKb({ categories: [email], articles: [buildArticle({ title: 'Read only', category: email })] })
  await render('read-only')
  await screen.findByRole('heading', { level: 1, name: 'Read only' })
  expect(screen.queryByRole('link', { name: 'Edit' })).not.toBeInTheDocument()
})

test('a spinner while loading, and an error with Try again', async () => {
  mockKb({ categories: [email], articles: [buildArticle({ title: 'Flaky page', category: email })] })
  const pending = deferred()
  let fail = true
  server.use(
    http.get(`${API}/kb/articles/:slug`, async () => {
      if (!fail) return HttpResponse.json(buildArticle({ title: 'Flaky page', category: email }))
      await pending.promise
      return HttpResponse.json({ message: 'Down' }, { status: 500 })
    }),
  )
  const { user } = await render('flaky-page')
  expect(screen.getByRole('status')).toHaveTextContent('Loading…')
  pending.resolve()
  expect(await screen.findByText("Couldn't load the knowledge base. Please try again.")).toBeInTheDocument()
  fail = false
  await user.click(screen.getByRole('button', { name: 'Try again' }))
  expect(await screen.findByRole('heading', { level: 1, name: 'Flaky page' })).toBeInTheDocument()
})
