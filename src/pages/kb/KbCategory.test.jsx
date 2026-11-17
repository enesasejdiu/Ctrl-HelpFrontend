// KbCategory.test.jsx – /kb/c/:categorySlug: its published articles, paged; empty, unknown category, error.
import { screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { buildArticle, buildCategory, mockKb } from '../../test/kbBackend'
import { buildUser } from '../../test/factories'
import { renderWithProviders } from '../../test/render'
import { API, server } from '../../test/server'
import KbCategory from './KbCategory'

const email = buildCategory({ id: 1, name: 'Email' })
const network = buildCategory({ id: 2, name: 'Network' })

const render = (route = '/kb/c/email') =>
  renderWithProviders(<KbCategory />, { route, path: '/kb/c/:categorySlug', user: buildUser({ role: 'employee' }) })

test('shows the category name and its published articles', async () => {
  const state = mockKb({
    categories: [email, network],
    articles: [
      buildArticle({ title: 'Mail on a phone', category: email }),
      buildArticle({ title: 'VPN failing', category: network }),
    ],
  })
  await render()
  expect(await screen.findByRole('heading', { level: 1, name: 'Email' })).toBeInTheDocument()
  expect(await screen.findByRole('link', { name: 'Mail on a phone' })).toBeInTheDocument()
  expect(screen.queryByText('VPN failing')).not.toBeInTheDocument()
  expect(screen.getByText('Showing 1–1 of 1')).toBeInTheDocument()
  expect(state.listRequests[0]).toMatchObject({ category: 'email', status: 'published', page: '1' })
})

test('empty: says there are no articles yet', async () => {
  mockKb({ categories: [email] })
  await render()
  expect(await screen.findByText('No articles in this category yet')).toBeInTheDocument()
})

test('an unknown category shows "not found"', async () => {
  const state = mockKb({ categories: [email] })
  await render('/kb/c/no-such-thing')
  expect(await screen.findByText("This category doesn't exist or has been removed.")).toBeInTheDocument()
  expect(state.listRequests).toEqual([])
})

test('an error with Try again', async () => {
  mockKb({ categories: [email] })
  let fail = true
  server.use(
    http.get(`${API}/kb/articles`, () =>
      fail
        ? HttpResponse.json({ message: 'Down' }, { status: 500 })
        : HttpResponse.json({ items: [], total: 0, page: 1, pageSize: 25 }),
    ),
  )
  const { user } = await render()
  expect(await screen.findByText("Couldn't load the knowledge base. Please try again.")).toBeInTheDocument()
  fail = false
  await user.click(screen.getByRole('button', { name: 'Try again' }))
  expect(await screen.findByText('No articles in this category yet')).toBeInTheDocument()
})

test('pages are in the URL', async () => {
  mockKb({
    categories: [email],
    articles: Array.from({ length: 27 }, (_, i) => buildArticle({ title: `Mail tip ${i + 1}`, category: email })),
  })
  const { user, router } = await render()
  expect(await screen.findByText('Showing 1–25 of 27')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: /Next/ }))
  expect(await screen.findByRole('link', { name: 'Mail tip 27' })).toBeInTheDocument()
  expect(router.state.location.search).toBe('?page=2')
})
