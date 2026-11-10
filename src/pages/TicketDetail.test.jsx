// TicketDetail.test.jsx – what each role gets on a ticket's page: staff (agents and admins) get the "Manage" box
// and the "Internal note" switch; employees and HR (HR is an employee for tickets) get neither.
import { screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { buildTicket, buildUser } from '../test/factories'
import { renderWithProviders } from '../test/render'
import { API, server } from '../test/server'
import TicketDetail from './TicketDetail'

const ticket = {
  ...buildTicket({ id: 42, title: 'Laptop does not turn on' }),
  status: 'in_progress',
  resolution: null,
  resolved_at: null,
  target_hours: 72,
  comments: [],
  history: [],
}

async function renderTicket(role) {
  server.use(
    http.get(`${API}/tickets/42`, () => HttpResponse.json(ticket)),
    http.get(`${API}/users/agents`, () => HttpResponse.json([])),
  )
  return renderWithProviders(<TicketDetail />, {
    route: '/tickets/42',
    path: '/tickets/:id',
    user: buildUser({ role }),
  })
}

describe('Ticket detail per role', () => {
  it.each(['hr', 'employee'])('%s: no Manage box and no internal-note switch', async (role) => {
    await renderTicket(role)

    expect(await screen.findByRole('heading', { name: /Laptop does not turn on/ })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Comment' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add comment' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Manage' })).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: 'Internal note' })).not.toBeInTheDocument()
  })

  it.each(['agent', 'admin'])('%s: gets the Manage box and the internal-note switch', async (role) => {
    await renderTicket(role)

    expect(await screen.findByRole('heading', { name: 'Manage' })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Internal note' })).toBeInTheDocument()
  })
})
