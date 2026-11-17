// KbSearch.test.jsx – /kb/search?q=: results with the words marked (escaped), "no results", too short, errors, pages.
import { screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { buildArticle, mockKb } from '../../test/kbBackend'
import { buildUser } from '../../test/factories'
import { renderWithProviders } from '../../test/render'
import { API, server } from '../../test/server'
import KbSearch from './KbSearch'

const render = (route) =>
  renderWithProviders(<KbSearch />, {
    route,
    user: buildUser({ role: 'employee' }),
    routes: [
      { path: '/kb/search', element: <KbSearch /> },
      { path: '/kb', element: <h1>KB home</h1> },
    ],
  })

test('lists the matches with the searched words marked in title and excerpt', async () => {
  mockKb({
    articles: [
      buildArticle({
        title: 'VPN says authentication failed',
        summary: 'Sign out of Windows after a VPN password change.',
      }),
      buildArticle({ title: 'Printer offline' }),
    ],
  })
  await render('/kb/search?q=vpn')
  expect(await screen.findByText('1 article for “vpn”')).toHaveAttribute('role', 'status')
  const results = screen.getByRole('list', { name: 'Search' })
  const marks = within(results)
    .getAllByText((_, el) => el.tagName === 'MARK')
    .map((el) => el.textContent)
  expect(marks).toEqual(['VPN', 'VPN'])
  expect(within(results).getByRole('link', { name: 'VPN says authentication failed' })).toHaveAttribute(
    'href',
    '/kb/vpn-says-authentication-failed',
  )
})

test('text that looks like HTML stays text: no element is made from it', async () => {
  mockKb({
    articles: [
      buildArticle({ title: 'About <script>alert(1)</script> tags', summary: '<img src=x onerror=alert(1)> script' }),
    ],
  })
  const { container } = await render('/kb/search?q=script')
  const link = await screen.findByRole('link', { name: 'About <script>alert(1)</script> tags' })
  expect(container.querySelector('script, img')).toBeNull()
  expect(link).toHaveTextContent('About <script>alert(1)</script> tags')
  // "script" is marked inside the text, as text: twice in the title (<script> and </script>), once in the excerpt
  expect([...container.querySelectorAll('mark')].map((m) => m.textContent)).toEqual(['script', 'script', 'script'])
})

test('no results: says so, with a link back to the knowledge base', async () => {
  mockKb()
  await render('/kb/search?q=nothing+here')
  expect(await screen.findByText('No articles match “nothing here”.')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Back to the knowledge base' })).toHaveAttribute('href', '/kb')
})

test('a search shorter than 2 characters asks for more and sends nothing', async () => {
  const state = mockKb()
  await render('/kb/search?q=x')
  expect(await screen.findByText('Type at least 2 characters to search.')).toBeInTheDocument()
  expect(state.listRequests).toEqual([])
})

test('the query is in the URL, and asked for published articles', async () => {
  const state = mockKb()
  await render('/kb/search?q=vpn&page=2')
  await screen.findByText('No articles match “vpn”.')
  expect(state.listRequests[0]).toMatchObject({ q: 'vpn', status: 'published', page: '2', pageSize: '25' })
})

test('the search box shows the current query', async () => {
  mockKb()
  await render('/kb/search?q=printer')
  expect(await screen.findByRole('searchbox', { name: 'Search the knowledge base' })).toHaveValue('printer')
})

test('an error with Try again', async () => {
  mockKb()
  let fail = true
  server.use(
    http.get(`${API}/kb/articles`, () =>
      fail
        ? HttpResponse.json({ message: 'Down' }, { status: 500 })
        : HttpResponse.json({ items: [], total: 0, page: 1, pageSize: 25 }),
    ),
  )
  const { user } = await render('/kb/search?q=vpn')
  expect(await screen.findByText("Couldn't load the knowledge base. Please try again.")).toBeInTheDocument()
  fail = false
  await user.click(screen.getByRole('button', { name: 'Try again' }))
  expect(await screen.findByText('No articles match “vpn”.')).toBeInTheDocument()
})

test('many results are paged', async () => {
  mockKb({ articles: Array.from({ length: 30 }, (_, i) => buildArticle({ title: `VPN tip ${i + 1}` })) })
  const { user, router } = await render('/kb/search?q=vpn')
  expect(await screen.findByText('30 articles for “vpn”')).toBeInTheDocument()
  expect(screen.getAllByRole('listitem')).toHaveLength(25)
  await user.click(screen.getByRole('button', { name: /Next/ }))
  expect(await screen.findByRole('link', { name: 'VPN tip 26' })).toBeInTheDocument()
  expect(router.state.location.search).toBe('?q=vpn&page=2')
})
