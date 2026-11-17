// CannedPicker.test.jsx – the canned-responses picker in a ticket's comment box (real TicketDetail page, MSW):
// opening with the button and with "/", filtering, the keyboard (↑/↓, Enter, Esc), inserting at the cursor and over a
// selection, the "/" replaced, placeholders filled, unknown ones warned about, focus back in the comment box, the
// browser's undo kept (execCommand('insertText')), the empty and error states, and nothing for employees.
import { act, screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import TicketDetail from '../../pages/TicketDetail'
import { buildCanned, mockCanned } from '../../test/cannedBackend'
import { buildTicket, buildUser } from '../../test/factories'
import { renderWithProviders } from '../../test/render'
import { API, server } from '../../test/server'

const agent = buildUser({ id: 7, name: 'Arben Krasniqi', role: 'agent' })
const employee = buildUser({ id: 4, name: 'Liridon Gashi', role: 'employee' })

const GREETING = buildCanned({
  id: 1,
  title: 'Greeting',
  body: 'Hello {{requester.first_name}}, this is {{agent.name}}.',
  usage_count: 9,
})
const PASSWORD = buildCanned({
  id: 2,
  title: 'Password reset',
  body: 'Your password for ticket #{{ticket.number}} was reset.',
  owner: null,
  usage_count: 3,
})
const ODD = buildCanned({
  id: 3,
  title: 'Odd one',
  body: 'Hi {{requester.nickname}} from {{company.name}}',
  usage_count: 1,
})

function mockTicket(comments = []) {
  const posts = []
  server.use(
    http.get(`${API}/tickets/42`, () =>
      HttpResponse.json({
        ...buildTicket({ id: 42, title: 'Printer broken', requester_id: employee.id, requester_name: 'Liridon Gashi' }),
        status: 'open',
        resolution: null,
        target_hours: 72,
        comments,
        history: [],
        attachments: [],
      }),
    ),
    http.get(`${API}/users/agents`, () => HttpResponse.json([])),
    http.get(`${API}/settings/public`, () => HttpResponse.json({ company_name: 'Acme' })),
    http.post(`${API}/tickets/42/comments`, async ({ request }) => {
      posts.push(await request.json())
      return HttpResponse.json({ id: 90 }, { status: 201 })
    }),
  )
  return posts
}

async function renderTicket(user = agent) {
  const result = await renderWithProviders(<TicketDetail />, { route: '/tickets/42', path: '/tickets/:id', user })
  await screen.findByRole('heading', { name: /Printer broken/ })
  return result
}

const commentBox = () => screen.getByRole('textbox', { name: 'Comment' })
const picker = () => screen.findByRole('dialog', { name: 'Canned responses' })
const search = () => screen.getByRole('combobox', { name: 'Search canned responses' })
const options = () => within(screen.getByRole('listbox', { name: 'Responses' })).getAllByRole('option')
const openWithButton = async (user) => {
  await user.click(screen.getByRole('button', { name: 'Canned responses' }))
  await picker()
  await waitFor(() => expect(options().length).toBeGreaterThan(0))
}

beforeEach(() => mockTicket())

describe('opening and closing', () => {
  test('the button opens it with the search field focused; most used first; Esc closes and focus goes back', async () => {
    mockCanned({ responses: [ODD, PASSWORD, GREETING] })
    const { user } = await renderTicket()
    await openWithButton(user)
    expect(search()).toHaveFocus()
    expect(search()).toHaveAttribute('aria-expanded', 'true')
    expect(options().map((o) => o.textContent)).toEqual([
      expect.stringContaining('Greeting'),
      expect.stringContaining('Password reset'),
      expect.stringContaining('Odd one'),
    ])
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'Canned responses' })).not.toBeInTheDocument()
    expect(commentBox()).toHaveFocus()
  })

  test('"/" as the first character of an empty comment opens it; elsewhere it is just a slash', async () => {
    mockCanned({ responses: [GREETING] })
    const { user } = await renderTicket()
    await user.type(commentBox(), 'a/b')
    expect(screen.queryByRole('dialog', { name: 'Canned responses' })).not.toBeInTheDocument()
    await user.clear(commentBox())
    await user.type(commentBox(), '/')
    expect(await picker()).toBeInTheDocument()
    expect(search()).toHaveFocus()
  })

  test('a click outside closes it', async () => {
    mockCanned({ responses: [GREETING] })
    const { user } = await renderTicket()
    await openWithButton(user)
    await user.click(screen.getByRole('heading', { name: /Printer broken/ }))
    expect(screen.queryByRole('dialog', { name: 'Canned responses' })).not.toBeInTheDocument()
  })

  test('employees get neither the button nor the "/" shortcut', async () => {
    const state = mockCanned({ responses: [GREETING] })
    const { user } = await renderTicket(employee)
    expect(screen.queryByRole('button', { name: 'Canned responses' })).not.toBeInTheDocument()
    await user.type(commentBox(), '/')
    expect(screen.queryByRole('dialog', { name: 'Canned responses' })).not.toBeInTheDocument()
    expect(commentBox()).toHaveValue('/')
    expect(state.listRequests).toEqual([])
  })
})

describe('finding one', () => {
  test('typing filters (sent as q after a short pause); the list says how many', async () => {
    const state = mockCanned({ responses: [GREETING, PASSWORD, ODD] })
    const { user } = await renderTicket()
    await openWithButton(user)
    await user.type(search(), 'password')
    await waitFor(() => expect(options()).toHaveLength(1))
    expect(options()[0]).toHaveTextContent('Password reset')
    expect(state.listRequests.at(-1)).toEqual({ q: 'password', scope: 'all' })
    // One request for the typed word, not one per letter
    expect(state.listRequests.filter((params) => params.q)).toHaveLength(1)
    expect(screen.getByText('1 response')).toBeInTheDocument()
  })

  test('↑/↓ move the highlight (aria-activedescendant, aria-selected) and the preview follows', async () => {
    mockCanned({ responses: [GREETING, PASSWORD] })
    const { user } = await renderTicket()
    await openWithButton(user)
    expect(options()[0]).toHaveAttribute('aria-selected', 'true')
    expect(search()).toHaveAttribute('aria-activedescendant', options()[0].id)
    await user.keyboard('{ArrowDown}')
    expect(options()[1]).toHaveAttribute('aria-selected', 'true')
    expect(search()).toHaveAttribute('aria-activedescendant', options()[1].id)
    const preview = screen.getByRole('region', { name: 'Preview' })
    expect(preview).toHaveTextContent('Your password for ticket #42 was reset.')
    await user.keyboard('{ArrowDown}') // wraps around
    expect(options()[0]).toHaveAttribute('aria-selected', 'true')
    await user.keyboard('{ArrowUp}')
    expect(options()[1]).toHaveAttribute('aria-selected', 'true')
  })

  test('the preview fills the placeholders and warns about one it does not know', async () => {
    mockCanned({ responses: [ODD] })
    const { user } = await renderTicket()
    await openWithButton(user)
    const preview = screen.getByRole('region', { name: 'Preview' })
    expect(preview).toHaveTextContent('Hi {{requester.nickname}} from Acme')
    expect(within(preview).getByText('{{requester.nickname}}').tagName).toBe('MARK')
    expect(preview).toHaveTextContent("{{requester.nickname}} isn't a known placeholder, so it stays as written.")
  })

  test('no responses at all: says so, with a link to create one', async () => {
    mockCanned({ responses: [] })
    const { user } = await renderTicket()
    await user.click(screen.getByRole('button', { name: 'Canned responses' }))
    expect(await screen.findByText(/No canned responses yet\./)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Create one' })).toHaveAttribute('href', '/settings/canned-responses')
  })

  test('nothing matches: says so', async () => {
    mockCanned({ responses: [GREETING] })
    const { user } = await renderTicket()
    await openWithButton(user)
    await user.type(search(), 'zebra')
    expect(await screen.findByText('No responses match “zebra”.')).toBeInTheDocument()
  })

  test('an error, with Try again', async () => {
    mockCanned({ responses: [GREETING] })
    let fail = true
    server.use(
      http.get(`${API}/canned-responses`, () =>
        fail
          ? HttpResponse.json({ message: 'Down' }, { status: 500 })
          : HttpResponse.json([{ ...GREETING, can_edit: true }]),
      ),
    )
    const { user } = await renderTicket()
    await user.click(screen.getByRole('button', { name: 'Canned responses' }))
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load canned responses.")
    fail = false
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(options()).toHaveLength(1))
  })
})

describe('inserting', () => {
  test('Enter inserts the filled-in text at the cursor, closes, focuses the comment box after it, counts a use', async () => {
    const state = mockCanned({ responses: [GREETING] })
    const { user } = await renderTicket()
    await user.type(commentBox(), 'Start. End.')
    commentBox().setSelectionRange(7, 7)
    await openWithButton(user)
    await user.keyboard('{Enter}')
    const inserted = 'Hello Liridon, this is Arben Krasniqi.'
    expect(commentBox()).toHaveValue(`Start. ${inserted}End.`)
    expect(commentBox()).toHaveFocus()
    expect(commentBox().selectionStart).toBe(7 + inserted.length)
    expect(screen.queryByRole('dialog', { name: 'Canned responses' })).not.toBeInTheDocument()
    await waitFor(() => expect(state.used).toEqual([GREETING.id]))
  })

  test('over a selection, it replaces the selected text', async () => {
    mockCanned({ responses: [PASSWORD] })
    const { user } = await renderTicket()
    await user.type(commentBox(), 'Hi. REPLACE ME Bye.')
    commentBox().setSelectionRange(4, 14)
    await openWithButton(user)
    await user.click(options()[0])
    expect(commentBox()).toHaveValue('Hi. Your password for ticket #42 was reset. Bye.')
  })

  test('opened with "/": the slash is replaced by the response', async () => {
    mockCanned({ responses: [GREETING] })
    const { user } = await renderTicket()
    await user.type(commentBox(), '/')
    await picker()
    await waitFor(() => expect(options()).toHaveLength(1))
    await user.keyboard('{Enter}')
    expect(commentBox()).toHaveValue('Hello Liridon, this is Arben Krasniqi.')
  })

  test('an unknown placeholder is inserted as written', async () => {
    mockCanned({ responses: [ODD] })
    const { user } = await renderTicket()
    await openWithButton(user)
    await user.keyboard('{Enter}')
    expect(commentBox()).toHaveValue('Hi {{requester.nickname}} from Acme')
  })

  test('it goes in the way typing does (execCommand insertText), so the browser can undo it', async () => {
    mockCanned({ responses: [GREETING] })
    // jsdom has no editing commands; this stands in for the browser's, as typing would
    const execCommand = vi.fn((command, _ui, text) => {
      const box = document.activeElement
      box.setRangeText(text, box.selectionStart, box.selectionEnd, 'end')
      box.dispatchEvent(new Event('input', { bubbles: true }))
      return command === 'insertText'
    })
    document.execCommand = execCommand
    try {
      const { user } = await renderTicket()
      await openWithButton(user)
      await user.keyboard('{Enter}')
      expect(execCommand).toHaveBeenCalledWith('insertText', false, 'Hello Liridon, this is Arben Krasniqi.')
      expect(commentBox()).toHaveValue('Hello Liridon, this is Arben Krasniqi.')
    } finally {
      delete document.execCommand
    }
  })

  test('nothing is sent until the user presses Add comment; what they edited is what goes', async () => {
    mockCanned({ responses: [GREETING] })
    const posts = mockTicket()
    const { user } = await renderTicket()
    await openWithButton(user)
    await user.keyboard('{Enter}')
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)))
    expect(posts).toEqual([])
    await user.type(commentBox(), ' Thanks!')
    await user.click(screen.getByRole('button', { name: 'Add comment' }))
    await waitFor(() => expect(posts).toHaveLength(1))
    expect(posts[0].content).toBe('Hello Liridon, this is Arben Krasniqi. Thanks!')
  })
})
