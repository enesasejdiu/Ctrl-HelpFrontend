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
  buildTicket({ title: 'Printer jammed on 3rd floor', status: 'open', priority: 'High', category: 'Hardware', is_overdue: true }),
  buildTicket({ title: 'VPN keeps disconnecting', status: 'in_progress', priority: 'Medium', category: 'Network', assignee_id: agent.id, assignee_name: agent.name }),
  buildTicket({ title: 'Outlook crashes on start', status: 'open', priority: 'Low', category: 'Email', assignee_id: 77, assignee_name: 'Drita Berisha' }),
  buildTicket({ title: 'Printer drivers missing', description: 'Need the Canon driver', status: 'resolved', priority: 'Medium', category: 'Software', assignee_id: agent.id, assignee_name: agent.name }),
]
const ALL_TITLES = TICKETS.map((t) => t.title)

// Fake backend filtering, mirroring GET /api/tickets. Returns the list of query strings it was called with.
function mockTickets(tickets = TICKETS, { currentUser = agent } = {}) {
  const queries = []
  server.use(
    http.get(`${API}/tickets`, ({ request }) => {
      const params = new URL(request.url).searchParams
      queries.push(params.toString())
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
      return HttpResponse.json(result)
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
      expect(screen.getByText('4 tickets')).toBeInTheDocument()
      expect(screen.getByText('· 1 overdue')).toBeInTheDocument()
      // The count is announced to screen readers when it changes
      expect(screen.getByText('4 tickets')).toHaveAttribute('aria-live', 'polite')
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
      expect(screen.getByText('1 ticket')).toBeInTheDocument()
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
