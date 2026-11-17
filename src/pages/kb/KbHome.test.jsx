// KbHome.test.jsx – /kb: search box, categories with counts, the latest articles; loading, empty and error states;
// staff-only links.
import { screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { buildArticle, buildCategory, mockKb } from '../../test/kbBackend'
import { buildUser } from '../../test/factories'
import { renderWithProviders } from '../../test/render'
import { API, deferred, server } from '../../test/server'
import KbHome from './KbHome'

const employee = buildUser({ role: 'employee' })
const agent = buildUser({ id: 7, role: 'agent' })

const render = (user = employee) =>
  renderWithProviders(<KbHome />, {
    route: '/kb',
    user,
    routes: [
      { path: '/kb', element: <KbHome /> },
      { path: '/kb/search', element: <h1>Search page</h1> },
      { path: '/kb/:slug', element: <h1>Article page</h1> },
    ],
  })

test('shows the categories with how many published articles each has, and the latest articles', async () => {
  const email = buildCategory({ id: 1, name: 'Email' })
  const network = buildCategory({ id: 2, name: 'Network' })
  mockKb({
    categories: [email, network],
    articles: [
      buildArticle({ title: 'Set up mail', category: email }),
      buildArticle({ title: 'Draft about mail', category: email, status: 'draft' }),
    ],
  })
  await render()

  const categories = await screen.findByRole('region', { name: 'Categories' })
  expect(within(categories).getByRole('link', { name: /Email\s*1 article/ })).toHaveAttribute('href', '/kb/c/email')
  expect(within(categories).getByRole('link', { name: /Network\s*0 articles/ })).toHaveAttribute(
    'href',
    '/kb/c/network',
  )
  const latest = screen.getByRole('list', { name: 'Latest articles' })
  expect(within(latest).getByRole('link', { name: 'Set up mail' })).toHaveAttribute('href', '/kb/set-up-mail')
  // Drafts never show here, even for staff (the page asks for published ones)
  expect(within(latest).queryByText('Draft about mail')).not.toBeInTheDocument()
})

test('asks for the 10 newest published articles', async () => {
  const state = mockKb()
  await render(agent)
  await screen.findByRole('region', { name: 'Categories' })
  expect(state.listRequests).toEqual([{ status: 'published', pageSize: '10', sort: 'published_at' }])
})

test('a spinner while loading', async () => {
  const pending = deferred()
  mockKb()
  server.use(http.get(`${API}/kb/categories`, () => pending.promise))
  await render()
  expect(screen.getByRole('status')).toHaveTextContent('Loading…')
  pending.resolve(HttpResponse.json([]))
  expect(await screen.findByText('No categories yet')).toBeInTheDocument()
})

test('empty: no categories and no articles yet', async () => {
  mockKb({ categories: [] })
  await render()
  expect(await screen.findByText('No categories yet')).toBeInTheDocument()
  expect(screen.getByText('No articles yet')).toBeInTheDocument()
  // The hint about Manage is for staff only
  expect(screen.queryByText(/Add a category on the Manage page/)).not.toBeInTheDocument()
})

test('an error with Try again, which loads again', async () => {
  let fail = true
  mockKb()
  server.use(
    http.get(`${API}/kb/categories`, () =>
      fail ? HttpResponse.json({ message: 'Down' }, { status: 500 }) : HttpResponse.json([]),
    ),
  )
  const { user } = await render()
  expect(await screen.findByText("Couldn't load the knowledge base. Please try again.")).toBeInTheDocument()
  fail = false
  await user.click(screen.getByRole('button', { name: 'Try again' }))
  expect(await screen.findByText('No categories yet')).toBeInTheDocument()
})

test('staff get "Manage articles" and "New article"; employees do not', async () => {
  mockKb()
  await render(agent)
  expect(await screen.findByRole('link', { name: 'Manage articles' })).toHaveAttribute('href', '/kb/manage')
  expect(screen.getByRole('link', { name: 'New article' })).toHaveAttribute('href', '/kb/new')
})

test('employees see no staff links', async () => {
  mockKb()
  await render()
  await screen.findByRole('region', { name: 'Categories' })
  expect(screen.queryByRole('link', { name: 'Manage articles' })).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'New article' })).not.toBeInTheDocument()
})

test('the search box opens /kb/search with the query; under 2 characters it says so instead', async () => {
  mockKb()
  const { user, router } = await render()
  const box = await screen.findByRole('searchbox', { name: 'Search the knowledge base' })
  await user.type(box, 'v')
  await user.click(screen.getByRole('button', { name: 'Search' }))
  expect(screen.getByRole('alert')).toHaveTextContent('Type at least 2 characters to search.')
  expect(box).toHaveAttribute('aria-invalid', 'true')
  await user.type(box, 'pn reset')
  await user.click(screen.getByRole('button', { name: 'Search' }))
  expect(await screen.findByRole('heading', { name: 'Search page' })).toBeInTheDocument()
  expect(router.state.location.search).toBe('?q=vpn+reset')
})
