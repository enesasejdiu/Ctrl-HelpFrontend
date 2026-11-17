// KbManage.test.jsx – /kb/manage (staff): every article in a table with a status filter, search and pages; the
// categories panel (add, edit, admin-only delete, 409s).
import { screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { buildArticle, buildCategory, mockKb } from '../../test/kbBackend'
import { buildUser } from '../../test/factories'
import { renderWithProviders } from '../../test/render'
import { API, server } from '../../test/server'
import KbManage from './KbManage'

const agent = buildUser({ id: 7, role: 'agent' })
const admin = buildUser({ id: 1, role: 'admin' })
const email = buildCategory({ id: 1, name: 'Email' })

const render = (user = agent, route = '/kb/manage') =>
  renderWithProviders(<KbManage />, { route, path: '/kb/manage', user })
const table = () => screen.findByRole('table', { name: 'Articles' })

test('every article, drafts too, with category, status and an edit link', async () => {
  mockKb({
    categories: [email],
    articles: [
      buildArticle({ title: 'Published one', category: email }),
      buildArticle({ title: 'Draft one', category: email, status: 'draft' }),
    ],
  })
  await render()
  const rows = within(await table())
    .getAllByRole('row')
    .slice(1)
  expect(
    rows.map((row) =>
      within(row)
        .getAllByRole('cell')
        .slice(0, 3)
        .map((cell) => cell.textContent),
    ),
  ).toEqual([
    ['Published one', 'Email', 'Published'],
    ['Draft one', 'Email', 'Draft'],
  ])
  expect(within(rows[1]).getByRole('link', { name: 'Draft one' })).toHaveAttribute('href', '/kb/draft-one/edit')
})

test('the status filter and the search go into the URL and the request', async () => {
  const state = mockKb({
    categories: [email],
    articles: [
      buildArticle({ title: 'VPN published', category: email }),
      buildArticle({ title: 'VPN draft here', category: email, status: 'draft' }),
    ],
  })
  const { user, router } = await render()
  await table()
  await user.selectOptions(screen.getByRole('combobox', { name: 'Status' }), 'draft')
  await waitFor(() => expect(router.state.location.search).toBe('?status=draft'))
  expect(await screen.findByRole('link', { name: 'VPN draft here' })).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'VPN published' })).not.toBeInTheDocument()

  await user.type(screen.getByRole('searchbox', { name: 'Search articles' }), 'vpn')
  await waitFor(() => expect(router.state.location.search).toBe('?status=draft&q=vpn'))
  await waitFor(() => expect(state.listRequests.at(-1)).toMatchObject({ q: 'vpn', status: 'draft' }))
})

test('empty: no articles yet; filtered: none match', async () => {
  mockKb({ categories: [email] })
  await render()
  expect(await screen.findByText('No articles yet')).toBeInTheDocument()
})

test('none match the filters', async () => {
  mockKb({ categories: [email], articles: [buildArticle({ title: 'Published one', category: email })] })
  await render(agent, '/kb/manage?status=draft')
  expect(await screen.findByText('No articles match these filters')).toBeInTheDocument()
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
  const section = (await screen.findAllByText("Couldn't load the knowledge base. Please try again."))[0].closest(
    'section',
  )
  fail = false
  await user.click(within(section).getByRole('button', { name: 'Try again' }))
  expect(await screen.findByText('No articles yet')).toBeInTheDocument()
})

describe('categories', () => {
  const panel = () => screen.findByRole('region', { name: 'Categories' })

  test('staff add one; the list and a status message update', async () => {
    const state = mockKb({ categories: [email] })
    const { user } = await render()
    await user.click(within(await panel()).getByRole('button', { name: 'Add category' }))
    const dialog = screen.getByRole('dialog', { name: 'Add category' })
    await user.type(within(dialog).getByLabelText('Name'), 'Network')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(await within(await panel()).findByText('Network')).toBeInTheDocument()
    expect(within(await panel()).getByText('Category saved.')).toBeInTheDocument()
    expect(state.categories.map((c) => c.name)).toEqual(['Email', 'Network'])
  })

  test('an empty name is caught; a name in use shows the server message under the field', async () => {
    mockKb({ categories: [email] })
    const { user } = await render()
    await user.click(within(await panel()).getByRole('button', { name: 'Add category' }))
    const dialog = screen.getByRole('dialog', { name: 'Add category' })
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(within(dialog).getByLabelText('Name')).toHaveAccessibleDescription('Name is required')
    await user.type(within(dialog).getByLabelText('Name'), 'EMAIL')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(within(dialog).getByLabelText('Name')).toHaveAccessibleDescription(
        'There is already a category called "EMAIL"',
      ),
    )
  })

  test('staff edit a category', async () => {
    const state = mockKb({ categories: [email] })
    const { user } = await render()
    await user.click(await within(await panel()).findByRole('button', { name: 'Edit Email' }))
    const dialog = screen.getByRole('dialog', { name: 'Edit category' })
    await user.clear(within(dialog).getByLabelText('Name'))
    await user.type(within(dialog).getByLabelText('Name'), 'Email & Calendar')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(await within(await panel()).findByText('Email & Calendar')).toBeInTheDocument()
    expect(state.categories[0].name).toBe('Email & Calendar')
  })

  test('only admins get Delete', async () => {
    mockKb({ categories: [email] })
    await render(agent)
    expect(within(await panel()).queryByRole('button', { name: 'Delete Email' })).not.toBeInTheDocument()
  })

  test('admins delete after confirming; a category with articles says why it stays', async () => {
    const network = buildCategory({ id: 2, name: 'Network' })
    const state = mockKb({
      categories: [email, network],
      articles: [buildArticle({ title: 'In email', category: email })],
    })
    const { user } = await render(admin)
    await user.click(await within(await panel()).findByRole('button', { name: 'Delete Email' }))
    const confirm = screen.getByRole('alertdialog', { name: 'Delete category' })
    await user.click(within(confirm).getByRole('button', { name: 'Delete' }))
    expect(await within(confirm).findByText('Move or delete the articles in this category first.')).toBeInTheDocument()
    await user.click(within(confirm).getByRole('button', { name: 'Cancel' }))

    await user.click(within(await panel()).getByRole('button', { name: 'Delete Network' }))
    await user.click(
      within(screen.getByRole('alertdialog', { name: 'Delete category' })).getByRole('button', { name: 'Delete' }),
    )
    expect(await within(await panel()).findByText('Category deleted.')).toBeInTheDocument()
    expect(state.categories.map((c) => c.name)).toEqual(['Email'])
  })
})
