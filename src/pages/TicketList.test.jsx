// TicketList.test.jsx – the ticket list and its filters. Filtering happens on the server, so these tests use a
// fake GET /tickets that really filters by the query string; that way "the list narrows" is checked end to end.
import { act, screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { buildTicket, buildUser } from '../test/factories'
import { currentParams, renderWithProviders } from '../test/render'
import { API, server } from '../test/server'
import TicketList from './TicketList'

const agent = buildUser({ name: 'Arben Krasniqi', role: 'agent' })
const employee = buildUser({ role: 'employee' })
const hr = buildUser({ name: 'Hana Rexhepi', role: 'hr' })

const TICKETS = [
  buildTicket({
    title: 'Printer jammed on 3rd floor',
    status: 'open',
    priority: 'High',
    category: 'Hardware',
    is_overdue: true,
  }),
  buildTicket({
    title: 'VPN keeps disconnecting',
    status: 'in_progress',
    priority: 'Medium',
    category: 'Network',
    assignee_id: agent.id,
    assignee_name: agent.name,
  }),
  buildTicket({
    title: 'Outlook crashes on start',
    status: 'open',
    priority: 'Low',
    category: 'Email',
    assignee_id: 77,
    assignee_name: 'Drita Berisha',
  }),
  buildTicket({
    title: 'Printer drivers missing',
    description: 'Need the Canon driver',
    status: 'resolved',
    priority: 'Medium',
    category: 'Software',
    assignee_id: agent.id,
    assignee_name: agent.name,
  }),
]
const ALL_TITLES = TICKETS.map((t) => t.title)

const PAGING = ['page', 'pageSize', 'sort', 'order']
// Sort keys like the backend's: priority by level, the rest by their value
const sortValue = {
  priority: (t) => t.priority_id,
  created_at: (t) => t.created_at,
  updated_at: (t) => t.updated_at ?? t.created_at,
  status: (t) => t.status,
  title: (t) => t.title.toLowerCase(),
}
// The paging part ({ page, pageSize, sort?, order? }) of every request since the last mockTickets()
let pagingRequests = []

// Fake backend filtering, sorting and paging, mirroring GET /api/tickets (always answers { items, total, page,
// pageSize }). Returns the FILTER part of every query string it was called with (paging left out; see pagingRequests).
function mockTickets(tickets = TICKETS, { currentUser = agent } = {}) {
  const queries = []
  pagingRequests = []
  server.use(
    http.get(`${API}/tickets`, ({ request }) => {
      const params = new URL(request.url).searchParams
      const filters = new URLSearchParams(params)
      for (const key of PAGING) filters.delete(key)
      queries.push(filters.toString())
      pagingRequests.push(
        Object.fromEntries(PAGING.filter((key) => params.has(key)).map((key) => [key, params.get(key)])),
      )
      const q = params.get('q')?.toLowerCase()
      const result = tickets.filter(
        (t) =>
          (!params.get('status') || t.status === params.get('status')) &&
          (!params.get('priority') || t.priority_id === Number(params.get('priority'))) &&
          (!params.get('category') || t.category_id === Number(params.get('category'))) &&
          (!params.get('overdue') || t.is_overdue) &&
          (params.get('assigned') !== 'me' || t.assignee_id === currentUser.id) &&
          (params.get('assigned') !== 'unassigned' || t.assignee_id === null) &&
          (!q || `${t.title} ${t.description}`.toLowerCase().includes(q)),
      )
      const sort = params.get('sort')
      if (sort) {
        const value = sortValue[sort]
        const direction = params.get('order') === 'desc' ? -1 : 1
        result.sort((a, b) => (value(a) < value(b) ? -direction : value(a) > value(b) ? direction : 0))
      }
      const page = Number(params.get('page') || 1)
      const pageSize = Number(params.get('pageSize') || 25)
      const items = result.slice((page - 1) * pageSize, page * pageSize)
      return HttpResponse.json({ items, total: result.length, page, pageSize })
    }),
  )
  return queries
}

async function renderList({ route = '/tickets', user = agent, userEventOptions } = {}) {
  return renderWithProviders(<TicketList />, { route, path: '/tickets', user, userEventOptions })
}

// Titles of the rows in the (visible) ticket table
function shownTitles() {
  const table = screen.getByRole('table')
  return within(table)
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getByRole('link').textContent)
}

const expectTitles = (titles) => waitFor(() => expect(shownTitles()).toEqual(titles))

// The priority/category dropdowns are filled from GET /meta
const waitForMeta = () => screen.findByRole('option', { name: 'Critical' })

describe('TicketList', () => {
  describe('states', () => {
    it('shows a loading state, then the tickets from the API', async () => {
      mockTickets()
      await renderList()

      expect(screen.getByText('Loading tickets…')).toBeInTheDocument()
      await expectTitles(ALL_TITLES)
      expect(screen.getByText('Showing 1–4 of 4')).toBeInTheDocument()
      expect(screen.getByText('· 1 overdue')).toBeInTheDocument()
      // The count is announced to screen readers when it changes
      expect(screen.getByText('Showing 1–4 of 4')).toHaveAttribute('aria-live', 'polite')
    })

    it('shows each ticket’s details in its row', async () => {
      mockTickets([TICKETS[1]])
      await renderList()

      const row = (await screen.findByRole('link', { name: 'VPN keeps disconnecting' })).closest('tr')
      expect(within(row).getByText('In Progress')).toBeInTheDocument()
      expect(within(row).getByText('Medium')).toBeInTheDocument()
      expect(within(row).getByText('Network')).toBeInTheDocument()
      expect(within(row).getByText('Arben Krasniqi')).toBeInTheDocument()
      expect(within(row).getByText('2h ago')).toBeInTheDocument()
      expect(screen.getByText('Showing 1–1 of 1')).toBeInTheDocument()
    })

    it('shows an empty state with a link to report a problem', async () => {
      mockTickets([])
      await renderList()

      expect(await screen.findByRole('heading', { name: 'No tickets found.' })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Report a problem' })).toHaveAttribute('href', '/tickets/new')
    })

    it('shows the error when the tickets cannot be loaded', async () => {
      server.use(
        http.get(`${API}/tickets`, () =>
          HttpResponse.json({ message: 'Something went wrong on the server' }, { status: 500 }),
        ),
      )
      await renderList()

      expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong on the server')
      expect(screen.queryByRole('table')).not.toBeInTheDocument()
    })

    it('shows the error when the filter options cannot be loaded', async () => {
      mockTickets()
      server.use(http.get(`${API}/meta`, () => HttpResponse.json({ message: 'Meta unavailable' }, { status: 500 })))
      await renderList()

      expect(await screen.findByRole('alert')).toHaveTextContent('Meta unavailable')
    })
  })

  describe('filters', () => {
    it('filters by status', async () => {
      const queries = mockTickets()
      const { user, router } = await renderList()
      await expectTitles(ALL_TITLES)

      await user.selectOptions(screen.getByRole('combobox', { name: 'Status' }), 'Open')

      await expectTitles(['Printer jammed on 3rd floor', 'Outlook crashes on start'])
      expect(currentParams(router)).toEqual({ status: 'open' })
      expect(queries.at(-1)).toBe('status=open')
    })

    it('filters by priority', async () => {
      mockTickets()
      const { user, router } = await renderList()
      await waitForMeta()

      await user.selectOptions(screen.getByRole('combobox', { name: 'Priority' }), 'Medium')

      await expectTitles(['VPN keeps disconnecting', 'Printer drivers missing'])
      expect(currentParams(router)).toEqual({ priority: '2' })
    })

    it('filters by category', async () => {
      mockTickets()
      const { user, router } = await renderList()
      await waitForMeta()

      await user.selectOptions(screen.getByRole('combobox', { name: 'Category' }), 'Network')

      await expectTitles(['VPN keeps disconnecting'])
      expect(currentParams(router)).toEqual({ category: '3' })
    })

    it('filters by assignee', async () => {
      mockTickets()
      const { user, router } = await renderList()
      await expectTitles(ALL_TITLES)
      const assigned = screen.getByRole('group', { name: 'Assigned to' })

      await user.click(within(assigned).getByRole('button', { name: 'Me' }))
      await expectTitles(['VPN keeps disconnecting', 'Printer drivers missing'])
      expect(within(assigned).getByRole('button', { name: 'Me' })).toHaveAttribute('aria-pressed', 'true')
      expect(currentParams(router)).toEqual({ assigned: 'me' })

      await user.click(within(assigned).getByRole('button', { name: 'Unassigned' }))
      await expectTitles(['Printer jammed on 3rd floor'])

      await user.click(within(assigned).getByRole('button', { name: 'Anyone' }))
      await expectTitles(ALL_TITLES)
      expect(currentParams(router)).toEqual({})
    })

    it('shows only overdue tickets when the switch is on', async () => {
      mockTickets()
      const { user, router } = await renderList()
      await expectTitles(ALL_TITLES)

      await user.click(screen.getByRole('checkbox', { name: 'Overdue only' }))

      await expectTitles(['Printer jammed on 3rd floor'])
      expect(currentParams(router)).toEqual({ overdue: '1' })
    })

    it('searches title and description after the user stops typing', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
      const queries = mockTickets()
      const { user, router } = await renderList({ userEventOptions: { advanceTimers: vi.advanceTimersByTime } })
      await expectTitles(ALL_TITLES)

      await user.type(screen.getByRole('searchbox', { name: 'Search tickets' }), 'printer')

      // Still typing: nothing sent yet
      expect(currentParams(router)).toEqual({})
      expect(queries).toEqual([''])

      await act(() => vi.advanceTimersByTimeAsync(300))

      await expectTitles(['Printer jammed on 3rd floor', 'Printer drivers missing'])
      expect(currentParams(router)).toEqual({ q: 'printer' })
      // One request for the whole word, not one per keystroke
      expect(queries).toEqual(['', 'q=printer'])
    })

    it('matches the search against the description too', async () => {
      mockTickets()
      const { user } = await renderList()
      await expectTitles(ALL_TITLES)

      await user.type(screen.getByRole('searchbox', { name: 'Search tickets' }), 'canon')

      await expectTitles(['Printer drivers missing'])
    })

    it('clears the search with the × button', async () => {
      mockTickets()
      const { user, router } = await renderList({ route: '/tickets?q=vpn' })
      await expectTitles(['VPN keeps disconnecting'])

      await user.click(screen.getByRole('button', { name: 'Clear search' }))

      await expectTitles(ALL_TITLES)
      expect(screen.getByRole('searchbox', { name: 'Search tickets' })).toHaveValue('')
      expect(currentParams(router)).toEqual({})
    })

    it('combines filters', async () => {
      mockTickets()
      const { user, router } = await renderList()
      await waitForMeta()

      await user.type(screen.getByRole('searchbox', { name: 'Search tickets' }), 'printer')
      await expectTitles(['Printer jammed on 3rd floor', 'Printer drivers missing'])
      await user.selectOptions(screen.getByRole('combobox', { name: 'Priority' }), 'Medium')

      await expectTitles(['Printer drivers missing'])
      expect(currentParams(router)).toEqual({ q: 'printer', priority: '2' })
    })

    it('shows the full list again after "Clear filters"', async () => {
      mockTickets()
      const { user, router } = await renderList()
      await expectTitles(ALL_TITLES)
      expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument()

      await user.selectOptions(screen.getByRole('combobox', { name: 'Status' }), 'Open')
      await user.type(screen.getByRole('searchbox', { name: 'Search tickets' }), 'outlook')
      await expectTitles(['Outlook crashes on start'])

      await user.click(screen.getByRole('button', { name: 'Clear filters' }))

      await expectTitles(ALL_TITLES)
      expect(currentParams(router)).toEqual({})
      expect(screen.getByRole('searchbox', { name: 'Search tickets' })).toHaveValue('')
      expect(screen.getByRole('combobox', { name: 'Status' })).toHaveValue('')
      expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument()
    })

    it('offers to clear the filters when nothing matches', async () => {
      mockTickets()
      const { user } = await renderList({ route: '/tickets?status=closed' })

      expect(await screen.findByRole('heading', { name: 'No tickets found.' })).toBeInTheDocument()
      expect(screen.getByText('Try a different search or remove some filters.')).toBeInTheDocument()

      // Only the empty state's button: the results bar doesn't repeat it
      await user.click(screen.getByRole('button', { name: 'Clear filters' }))

      await expectTitles(ALL_TITLES)
    })

    it('applies the filters from the URL on load', async () => {
      const queries = mockTickets()
      await renderList({ route: '/tickets?status=open&priority=3&q=printer' })

      await expectTitles(['Printer jammed on 3rd floor'])
      expect(queries).toEqual(['q=printer&status=open&priority=3'])
      expect(screen.getByRole('searchbox', { name: 'Search tickets' })).toHaveValue('printer')
      expect(screen.getByRole('combobox', { name: 'Status' })).toHaveValue('open')
      await waitForMeta()
      expect(screen.getByRole('combobox', { name: 'Priority' })).toHaveValue('3')
    })
  })

  describe('as an employee', () => {
    it('shows "My tickets" without the staff-only filters', async () => {
      mockTickets([TICKETS[0]], { currentUser: employee })
      await renderList({ user: employee })

      expect(screen.getByRole('heading', { name: 'My tickets' })).toBeInTheDocument()
      await expectTitles(['Printer jammed on 3rd floor'])
      expect(screen.queryByRole('group', { name: 'Assigned to' })).not.toBeInTheDocument()
      expect(screen.queryByRole('checkbox', { name: 'Overdue only' })).not.toBeInTheDocument()
    })

    // HR is not staff: for tickets HR is an employee and only sees their own
    it('HR also gets "My tickets" without the staff-only filters', async () => {
      mockTickets([TICKETS[0]], { currentUser: hr })
      await renderList({ user: hr })

      expect(screen.getByRole('heading', { name: 'My tickets' })).toBeInTheDocument()
      expect(screen.queryByRole('heading', { name: 'All tickets' })).not.toBeInTheDocument()
      await expectTitles(['Printer jammed on 3rd floor'])
      expect(screen.queryByRole('group', { name: 'Assigned to' })).not.toBeInTheDocument()
      expect(screen.queryByRole('checkbox', { name: 'Overdue only' })).not.toBeInTheDocument()
    })

    it('ignores staff-only filters in the URL', async () => {
      const queries = mockTickets(TICKETS, { currentUser: employee })
      await renderList({ user: employee, route: '/tickets?assigned=me&overdue=1&status=open' })

      await expectTitles(['Printer jammed on 3rd floor', 'Outlook crashes on start'])
      expect(queries).toEqual(['status=open'])
    })
  })
})

// ---- Paging and sorting (GET /tickets?page=&pageSize=&sort=&order=, answering { items, total, page, pageSize }) ----
const PRIORITY_NAMES = ['Low', 'Medium', 'High', 'Critical']
// 30 tickets: "Ticket 01" … "Ticket 30", created one hour apart (Ticket 30 newest), priorities taking turns
const MANY = Array.from({ length: 30 }, (_, i) =>
  buildTicket({
    title: `Ticket ${String(i + 1).padStart(2, '0')}`,
    status: 'open',
    priority: PRIORITY_NAMES[i % 4],
    created_at: new Date(Date.UTC(2026, 10, 1, i)).toISOString(),
  }),
)
const pager = () => screen.getByRole('navigation', { name: 'Ticket pages' })
const header = (name) => screen.getByRole('columnheader', { name: new RegExp(`^${name}`) })

describe('TicketList paging and sorting', () => {
  it('always asks for a page: page 1 of 25 by default, and says what is shown', async () => {
    mockTickets(MANY)
    await renderList()

    await expectTitles(MANY.slice(0, 25).map((t) => t.title))
    expect(pagingRequests).toEqual([{ page: '1', pageSize: '25' }])
    expect(screen.getByText('Showing 1–25 of 30')).toHaveAttribute('aria-live', 'polite')
    expect(within(pager()).getByText('Page 1 of 2')).toBeInTheDocument()
    expect(within(pager()).getByRole('button', { name: 'Previous' })).toBeDisabled()
  })

  it('Next and Previous move through the pages and keep the page in the URL', async () => {
    mockTickets(MANY)
    const { user, router } = await renderList()
    await expectTitles(MANY.slice(0, 25).map((t) => t.title))

    await user.click(within(pager()).getByRole('button', { name: 'Next' }))
    await expectTitles(MANY.slice(25).map((t) => t.title))
    expect(currentParams(router)).toEqual({ page: '2' })
    expect(screen.getByText('Showing 26–30 of 30')).toBeInTheDocument()
    expect(within(pager()).getByText('Page 2 of 2')).toBeInTheDocument()
    expect(within(pager()).getByRole('button', { name: 'Next' })).toBeDisabled()

    await user.click(within(pager()).getByRole('button', { name: 'Previous' }))
    await expectTitles(MANY.slice(0, 25).map((t) => t.title))
    expect(currentParams(router)).toEqual({})
  })

  it('the page size picker: 25, 50 or 100, back to page 1', async () => {
    mockTickets(MANY)
    const { user, router } = await renderList({ route: '/tickets?page=2' })
    await expectTitles(MANY.slice(25).map((t) => t.title))

    const size = within(pager()).getByLabelText('Per page')
    expect([...size.options].map((o) => o.value)).toEqual(['25', '50', '100'])
    await user.selectOptions(size, '50')

    await expectTitles(MANY.map((t) => t.title))
    expect(currentParams(router)).toEqual({ pageSize: '50' })
    expect(within(pager()).getByText('Page 1 of 1')).toBeInTheDocument()
  })

  it('column headers sort: an arrow, aria-sort, and clicking again flips the order', async () => {
    mockTickets(MANY)
    const { user, router } = await renderList()
    await expectTitles(MANY.slice(0, 25).map((t) => t.title))
    expect(header('Priority')).toHaveAttribute('aria-sort', 'none')

    // Priority starts with the most urgent first
    await user.click(within(header('Priority')).getByRole('button'))
    await waitFor(() => expect(currentParams(router)).toEqual({ sort: 'priority', order: 'desc' }))
    expect(header('Priority')).toHaveAttribute('aria-sort', 'descending')
    await waitFor(() => expect(shownTitles()[0]).toBe('Ticket 04')) // the first Critical one
    expect(pagingRequests.at(-1)).toEqual({ page: '1', pageSize: '25', sort: 'priority', order: 'desc' })

    await user.click(within(header('Priority')).getByRole('button'))
    await waitFor(() => expect(header('Priority')).toHaveAttribute('aria-sort', 'ascending'))
    expect(currentParams(router)).toEqual({ sort: 'priority', order: 'asc' })

    // Another column: its own first order (A–Z for the title), and the others go back to unsorted
    await user.click(within(header('Title')).getByRole('button'))
    await waitFor(() => expect(header('Title')).toHaveAttribute('aria-sort', 'ascending'))
    expect(header('Priority')).toHaveAttribute('aria-sort', 'none')
  })

  it('sorting goes back to page 1', async () => {
    mockTickets(MANY)
    const { user, router } = await renderList({ route: '/tickets?page=2' })
    await expectTitles(MANY.slice(25).map((t) => t.title))

    await user.click(within(header('Created')).getByRole('button'))
    await waitFor(() => expect(currentParams(router)).toEqual({ sort: 'created_at', order: 'desc' }))
    await waitFor(() => expect(shownTitles()[0]).toBe('Ticket 30'))
  })

  it('page, size, sort, order and filters in the URL are used on load (a reload keeps them)', async () => {
    mockTickets(MANY)
    await renderList({ route: '/tickets?status=open&page=2&pageSize=25&sort=title&order=desc' })

    await expectTitles(['Ticket 05', 'Ticket 04', 'Ticket 03', 'Ticket 02', 'Ticket 01'])
    expect(pagingRequests).toEqual([{ page: '2', pageSize: '25', sort: 'title', order: 'desc' }])
    expect(header('Title')).toHaveAttribute('aria-sort', 'descending')
    expect(screen.getByRole('combobox', { name: 'Status' })).toHaveValue('open')
  })

  it('changing a filter goes back to page 1 and keeps the sort', async () => {
    mockTickets(MANY)
    const { user, router } = await renderList({ route: '/tickets?page=2&sort=title&order=asc' })
    await expectTitles(MANY.slice(25).map((t) => t.title))
    await waitForMeta()

    await user.selectOptions(screen.getByRole('combobox', { name: 'Priority' }), 'Critical')

    await waitFor(() => expect(currentParams(router)).toEqual({ priority: '4', sort: 'title', order: 'asc' }))
    expect(pagingRequests.at(-1)).toEqual({ page: '1', pageSize: '25', sort: 'title', order: 'asc' })
  })

  it('"Clear filters" keeps the page size and the sort', async () => {
    mockTickets(MANY)
    const { user, router } = await renderList({ route: '/tickets?status=open&pageSize=50&sort=title&order=asc&page=1' })
    await expectTitles(MANY.map((t) => t.title))

    await user.click(screen.getByRole('button', { name: 'Clear filters' }))
    await waitFor(() => expect(currentParams(router)).toEqual({ pageSize: '50', sort: 'title', order: 'asc' }))
  })

  it('an empty page past the end (e.g. after tickets were closed or deleted) goes to the last page', async () => {
    mockTickets(MANY)
    const { router } = await renderList({ route: '/tickets?page=5' })

    await expectTitles(MANY.slice(25).map((t) => t.title))
    expect(currentParams(router)).toEqual({ page: '2' })
    expect(pagingRequests.map((r) => r.page)).toEqual(['5', '2'])
  })

  it('invalid paging values in the URL are not sent: the defaults are', async () => {
    mockTickets(MANY)
    await renderList({ route: '/tickets?page=abc&pageSize=33&sort=password&order=up' })

    await expectTitles(MANY.slice(0, 25).map((t) => t.title))
    expect(pagingRequests).toEqual([{ page: '1', pageSize: '25' }])
  })

  it("the backend's 400 is shown with its details, and can be reset", async () => {
    mockTickets(MANY)
    server.use(
      http.get(`${API}/tickets`, ({ request }) => {
        if (new URL(request.url).searchParams.get('sort') === 'title') {
          return HttpResponse.json(
            {
              message: 'Invalid query',
              errors: [{ field: 'sort', message: 'Sort must be one of created_at, priority' }],
            },
            { status: 400 },
          )
        }
        return HttpResponse.json({ items: MANY.slice(0, 25), total: 30, page: 1, pageSize: 25 })
      }),
    )
    const { user, router } = await renderList({ route: '/tickets?sort=title&order=asc' })

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Invalid query')
    expect(alert).toHaveTextContent('sort: Sort must be one of created_at, priority')
    await user.click(within(alert).getByRole('button', { name: 'Reset sorting and pages' }))

    await waitFor(() => expect(currentParams(router)).toEqual({}))
    await expectTitles(MANY.slice(0, 25).map((t) => t.title))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('on phones the sort is a dropdown (the header row is hidden there); it sets the same URL values', async () => {
    mockTickets(MANY)
    const { user, router } = await renderList()
    await expectTitles(MANY.slice(0, 25).map((t) => t.title))

    await user.selectOptions(screen.getByLabelText('Sort by'), 'priority:desc')
    await waitFor(() => expect(currentParams(router)).toEqual({ sort: 'priority', order: 'desc' }))
    expect(screen.getByLabelText('Sort by')).toHaveValue('priority:desc')

    await user.selectOptions(screen.getByLabelText('Sort by'), '')
    await waitFor(() => expect(currentParams(router)).toEqual({}))
  })

  it('no pages bar when there are no tickets', async () => {
    mockTickets([])
    await renderList()
    await screen.findByText('No tickets found.')
    expect(screen.queryByRole('navigation', { name: 'Ticket pages' })).not.toBeInTheDocument()
  })
})
