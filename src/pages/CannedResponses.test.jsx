// CannedResponses.test.jsx – /settings/canned-responses (staff): the Mine / Shared tabs, the table, the search, who
// gets Edit and Delete, the create/edit dialog (checks, server messages, placeholder chips, "Shared with all staff"
// for admins only), and deleting after a confirmation.
import { screen, waitFor, within } from '@testing-library/react'
import { buildCanned, mockCanned } from '../test/cannedBackend'
import { buildUser } from '../test/factories'
import { renderWithProviders } from '../test/render'
import CannedResponses from './CannedResponses'

const agent = buildUser({ id: 7, name: 'Arben Krasniqi', role: 'agent' })
const admin = buildUser({ id: 1, name: 'Ada Admin', role: 'admin' })

const MINE = buildCanned({ id: 1, title: 'My greeting', body: 'Hello {{requester.first_name}}', usage_count: 4 })
const SHARED = buildCanned({
  id: 2,
  title: 'Password reset',
  body: 'Your password was reset.',
  owner: null,
  usage_count: 12,
})
const OTHERS = buildCanned({ id: 3, title: "Someone else's", owner: 99 })

const render = (user = agent, route = '/settings/canned-responses') =>
  renderWithProviders(<CannedResponses />, { route, path: '/settings/canned-responses', user })
const table = () => screen.findByRole('table', { name: 'Canned responses' })
const rows = async () =>
  within(await table())
    .getAllByRole('row')
    .slice(1)
const tab = (name) => screen.getByRole('tab', { name })

describe('tabs and table', () => {
  test('"Mine" first: title, preview, uses and when; never anyone else\'s', async () => {
    const state = mockCanned({ responses: [MINE, SHARED, OTHERS] })
    await render()
    expect(tab('Mine')).toHaveAttribute('aria-selected', 'true')
    const [row] = await rows()
    expect(
      within(row)
        .getAllByRole('cell')
        .slice(0, 3)
        .map((cell) => cell.textContent),
    ).toEqual(['My greeting', 'Hello {{requester.first_name}}', '4 times'])
    expect(await rows()).toHaveLength(1)
    expect(state.listRequests.at(-1)).toEqual({ scope: 'mine' })
  })

  test('"Shared" lists the shared ones; the tab is in the URL; arrow keys move between tabs', async () => {
    mockCanned({ responses: [MINE, SHARED] })
    const { user, router } = await render()
    await table()
    await user.click(tab('Shared'))
    await waitFor(() => expect(router.state.location.search).toBe('?tab=shared'))
    expect((await rows()).map((row) => within(row).getAllByRole('cell')[0].textContent)).toEqual(['Password reset'])
    expect(tab('Shared')).toHaveFocus()
    await user.keyboard('{ArrowLeft}')
    expect(tab('Mine')).toHaveFocus()
    expect(tab('Mine')).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel')).toHaveAccessibleName('Mine')
  })

  test('search goes into the URL and the request', async () => {
    const state = mockCanned({ responses: [MINE, buildCanned({ id: 5, title: 'Printer help', body: 'Restart it.' })] })
    const { user, router } = await render()
    await table()
    await user.type(screen.getByRole('searchbox', { name: 'Search responses' }), 'printer')
    await waitFor(() => expect(router.state.location.search).toBe('?q=printer'))
    await waitFor(() => expect(state.listRequests.at(-1)).toEqual({ scope: 'mine', q: 'printer' }))
    expect((await rows()).map((row) => within(row).getAllByRole('cell')[0].textContent)).toEqual(['Printer help'])
  })

  test('empty states: none yet, and none matching', async () => {
    mockCanned({ responses: [] })
    await render()
    expect(await screen.findByText('You have no canned responses yet')).toBeInTheDocument()
  })

  test('none matching the search', async () => {
    mockCanned({ responses: [MINE] })
    await render(agent, '/settings/canned-responses?q=zebra')
    expect(await screen.findByText('No responses match “zebra”')).toBeInTheDocument()
  })
})

describe('who may change what', () => {
  test('an agent: Edit/Delete on their own, none on shared ones, and no "New response" on the Shared tab', async () => {
    mockCanned({ responses: [MINE, SHARED] })
    await render()
    expect(await screen.findByRole('button', { name: 'Edit My greeting' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete My greeting' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New response' })).toBeInTheDocument()
  })

  test('an agent on the Shared tab', async () => {
    mockCanned({ responses: [MINE, SHARED] })
    await render(agent, '/settings/canned-responses?tab=shared')
    await screen.findByRole('table', { name: 'Canned responses' })
    expect(screen.queryByRole('button', { name: 'Edit Password reset' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete Password reset' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'New response' })).not.toBeInTheDocument()
  })

  test('an admin can change shared ones, and gets "Shared with all staff" when creating', async () => {
    const state = mockCanned({ responses: [SHARED] })
    const { user } = await render(admin, '/settings/canned-responses?tab=shared')
    expect(await screen.findByRole('button', { name: 'Edit Password reset' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'New response' }))
    const dialog = screen.getByRole('dialog', { name: 'New canned response' })
    // Ticked already, because it was opened from the Shared tab
    expect(within(dialog).getByRole('checkbox', { name: 'Shared with all staff' })).toBeChecked()
    await user.type(within(dialog).getByRole('textbox', { name: 'Title' }), 'VPN steps')
    await user.type(within(dialog).getByRole('textbox', { name: 'Text' }), 'Open the VPN app.')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(state.saves).toHaveLength(1))
    expect(state.saves[0].body).toEqual({ title: 'VPN steps', body: 'Open the VPN app.', shared: true })
  })

  test('an agent never gets the "Shared with all staff" switch', async () => {
    mockCanned({ responses: [] })
    const { user } = await render()
    await user.click(await screen.findByRole('button', { name: 'New response' }))
    expect(
      within(screen.getByRole('dialog', { name: 'New canned response' })).queryByRole('checkbox'),
    ).not.toBeInTheDocument()
  })
})

describe('the dialog', () => {
  test('checks the fields first and sends nothing', async () => {
    const state = mockCanned({ responses: [] })
    const { user } = await render()
    await user.click(await screen.findByRole('button', { name: 'New response' }))
    const dialog = screen.getByRole('dialog', { name: 'New canned response' })
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(within(dialog).getByText('Please fix the fields marked below.')).toBeInTheDocument()
    expect(within(dialog).getByRole('textbox', { name: 'Title' })).toHaveAccessibleDescription('Title is required')
    expect(within(dialog).getByRole('textbox', { name: 'Text' })).toHaveAccessibleDescription(
      expect.stringContaining('The text is required'),
    )
    expect(state.saves).toEqual([])
  })

  test('a title already in use shows the server message under Title', async () => {
    mockCanned({ responses: [MINE] })
    const { user } = await render()
    await user.click(await screen.findByRole('button', { name: 'New response' }))
    const dialog = screen.getByRole('dialog', { name: 'New canned response' })
    await user.type(within(dialog).getByRole('textbox', { name: 'Title' }), 'MY GREETING')
    await user.type(within(dialog).getByRole('textbox', { name: 'Text' }), 'Hi')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(within(dialog).getByRole('textbox', { name: 'Title' })).toHaveAccessibleDescription(
        'You already have a response with this title',
      ),
    )
  })

  test('the counters, and clicking a placeholder puts it in at the cursor', async () => {
    mockCanned({ responses: [] })
    const { user } = await render()
    await user.click(await screen.findByRole('button', { name: 'New response' }))
    const dialog = screen.getByRole('dialog', { name: 'New canned response' })
    const body = within(dialog).getByRole('textbox', { name: 'Text' })
    await user.type(body, 'Hello , welcome')
    body.setSelectionRange(6, 6)
    await user.click(within(dialog).getByRole('button', { name: /\{\{requester\.first_name\}\}/ }))
    expect(body).toHaveValue('Hello {{requester.first_name}}, welcome')
    expect(within(dialog).getByText('39/5000')).toBeInTheDocument()
  })

  test('editing saves the changes and says so', async () => {
    const state = mockCanned({ responses: [MINE] })
    const { user } = await render()
    await user.click(await screen.findByRole('button', { name: 'Edit My greeting' }))
    const dialog = screen.getByRole('dialog', { name: 'Edit canned response' })
    expect(within(dialog).getByText('Only you can see this response')).toBeInTheDocument()
    await user.clear(within(dialog).getByRole('textbox', { name: 'Title' }))
    await user.type(within(dialog).getByRole('textbox', { name: 'Title' }), 'Greeting')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Response saved.')).toBeInTheDocument()
    expect(state.saves[0]).toEqual({
      method: 'PATCH',
      id: 1,
      body: { title: 'Greeting', body: 'Hello {{requester.first_name}}' },
    })
    expect((await rows()).map((row) => within(row).getAllByRole('cell')[0].textContent)).toEqual(['Greeting'])
  })
})

describe('deleting', () => {
  test('asks first; Cancel keeps it, Delete removes it and says so', async () => {
    const state = mockCanned({ responses: [MINE] })
    const { user } = await render()
    await user.click(await screen.findByRole('button', { name: 'Delete My greeting' }))
    let confirm = screen.getByRole('alertdialog', { name: 'Delete canned response' })
    expect(confirm).toHaveTextContent("Delete “My greeting”? This can't be undone.")
    await user.click(within(confirm).getByRole('button', { name: 'Cancel' }))
    expect(state.deletes).toEqual([])

    await user.click(screen.getByRole('button', { name: 'Delete My greeting' }))
    confirm = screen.getByRole('alertdialog', { name: 'Delete canned response' })
    await user.click(within(confirm).getByRole('button', { name: 'Delete' }))
    expect(await screen.findByText('Response deleted.')).toBeInTheDocument()
    expect(state.deletes).toEqual([1])
    expect(await screen.findByText('You have no canned responses yet')).toBeInTheDocument()
  })
})
