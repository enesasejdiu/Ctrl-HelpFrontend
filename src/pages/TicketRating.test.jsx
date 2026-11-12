// TicketRating.test.jsx – the satisfaction rating on a ticket's page: "How did we do?" right after the requester
// closes their ticket, "Rate this ticket" on a closed ticket they haven't rated, and the saved rating in the Details
// box for everyone who can see the ticket. A backend without ratings (no `rating` field) shows none of it.
import { screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { buildTicket, buildUser } from '../test/factories'
import { renderWithProviders } from '../test/render'
import { API, server } from '../test/server'
import TicketDetail from './TicketDetail'

const REQUESTER = buildUser({ id: 7, role: 'employee', name: 'Liridon Gashi' })
const RATING = { stars: 4, comment: 'Fixed in an hour, thanks!', created_at: '2026-11-12T10:00:00.000Z' }

function ticketWith(overrides) {
  return {
    ...buildTicket({ id: 42, title: 'Laptop does not turn on', requester_id: REQUESTER.id }),
    status: 'resolved',
    resolution: 'Replaced the charger',
    resolved_at: '2026-11-12T09:00:00.000Z',
    target_hours: 72,
    comments: [],
    history: [],
    rating: null,
    ...overrides,
  }
}

// The mock ticket changes like the real one: closing sets the status, rating stores the rating
async function renderTicket({ user = REQUESTER, ticket = ticketWith(), rate } = {}) {
  let current = ticket
  const sent = { status: [], rating: [] }
  server.use(
    http.get(`${API}/tickets/42`, () => HttpResponse.json(current)),
    http.get(`${API}/users/agents`, () => HttpResponse.json([])),
    http.patch(`${API}/tickets/42/status`, async ({ request }) => {
      const body = await request.json()
      sent.status.push(body)
      current = { ...current, status: body.status }
      return HttpResponse.json(current)
    }),
    http.post(`${API}/tickets/42/rating`, async ({ request }) => {
      const body = await request.json()
      sent.rating.push(body)
      if (rate) return rate()
      current = { ...current, rating: { ...RATING, ...body, comment: body.comment ?? null } }
      return HttpResponse.json(current.rating, { status: 201 })
    }),
  )
  const view = await renderWithProviders(<TicketDetail />, { route: '/tickets/42', path: '/tickets/:id', user })
  await screen.findByRole('heading', { name: /Laptop does not turn on/ })
  return { ...view, sent }
}

const details = () => screen.getByRole('heading', { name: 'Details' }).closest('section')
const rateButton = () => screen.queryByRole('button', { name: 'Rate this ticket' })

describe('Satisfaction rating on the ticket page', () => {
  it('asks "How did we do?" right after the requester closes the ticket, and shows the rating once sent', async () => {
    const { user, sent } = await renderTicket()

    await user.click(screen.getByRole('button', { name: 'Close' }))
    const dialog = await screen.findByRole('dialog', { name: 'How did we do?' })
    expect(sent.status).toEqual([{ status: 'closed' }])

    await user.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}')
    await user.type(within(dialog).getByLabelText(/Comment/), 'Fixed in an hour, thanks!')
    await user.click(within(dialog).getByRole('button', { name: 'Send' }))

    expect(await within(details()).findByRole('img', { name: '4 of 5 stars' })).toBeInTheDocument()
    expect(within(details()).getByText('Fixed in an hour, thanks!')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(rateButton()).not.toBeInTheDocument()
    expect(sent.rating).toEqual([{ stars: 4, comment: 'Fixed in an hour, thanks!' }])
  })

  it('after Skip, offers "Rate this ticket", which opens the dialog again and gets focus back', async () => {
    const { user, sent } = await renderTicket()

    await user.click(screen.getByRole('button', { name: 'Close' }))
    await user.click(await screen.findByRole('button', { name: 'Skip' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(rateButton()).toHaveFocus()
    expect(sent.rating).toEqual([])

    await user.click(rateButton())
    expect(screen.getByRole('dialog', { name: 'How did we do?' })).toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: '2 of 5 stars' }))
    await user.click(screen.getByRole('button', { name: 'Send' }))

    expect(await within(details()).findByRole('img', { name: '2 of 5 stars' })).toBeInTheDocument()
    expect(sent.rating).toEqual([{ stars: 2 }])
  })

  it('offers "Rate this ticket" on a closed, unrated ticket of the requester', async () => {
    await renderTicket({ ticket: ticketWith({ status: 'closed' }) })

    expect(rateButton()).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reopen' })).toBeInTheDocument()
  })

  it('offers it to staff too when they are the requester', async () => {
    await renderTicket({ user: buildUser({ id: 7, role: 'agent' }), ticket: ticketWith({ status: 'closed' }) })

    expect(rateButton()).toBeInTheDocument()
  })

  it.each([
    ['someone who is not the requester', { user: buildUser({ id: 8, role: 'admin' }) }],
    ['a resolved ticket that is not closed yet', { ticket: ticketWith({ status: 'resolved' }) }],
    ['a reopened ticket', { ticket: ticketWith({ status: 'reopened' }) }],
  ])('offers no rating for %s', async (_, options) => {
    await renderTicket({ ticket: ticketWith({ status: 'closed' }), ...options })

    expect(rateButton()).not.toBeInTheDocument()
  })

  it.each([
    ['the requester', REQUESTER],
    ['an agent', buildUser({ id: 8, role: 'agent' })],
    ['an admin', buildUser({ id: 9, role: 'admin' })],
  ])('shows a saved rating and its comment to %s, with nothing left to rate', async (_, viewer) => {
    await renderTicket({ user: viewer, ticket: ticketWith({ status: 'closed', rating: RATING }) })

    expect(within(details()).getByRole('img', { name: '4 of 5 stars' })).toBeInTheDocument()
    expect(within(details()).getByText('Fixed in an hour, thanks!')).toBeInTheDocument()
    expect(rateButton()).not.toBeInTheDocument()
  })

  it('shows a rating without a comment as just the stars', async () => {
    await renderTicket({ ticket: ticketWith({ status: 'closed', rating: { ...RATING, comment: null } }) })

    expect(within(details()).getByRole('img', { name: '4 of 5 stars' })).toBeInTheDocument()
    expect(within(details()).queryByText(/Comment/)).not.toBeInTheDocument()
  })

  it('a ticket rated in another tab (409) closes the dialog and shows the stored rating', async () => {
    let stored = false
    const { user } = await renderTicket({
      rate: () => {
        stored = true
        return HttpResponse.json({ message: 'This ticket is already rated', code: 'ALREADY_RATED' }, { status: 409 })
      },
    })
    await user.click(screen.getByRole('button', { name: 'Close' }))
    await screen.findByRole('dialog', { name: 'How did we do?' })
    server.use(
      http.get(`${API}/tickets/42`, () =>
        HttpResponse.json(ticketWith({ status: 'closed', rating: stored ? RATING : null })),
      ),
    )

    await user.click(screen.getByRole('radio', { name: '5 of 5 stars' }))
    await user.click(screen.getByRole('button', { name: 'Send' }))

    expect(await within(details()).findByRole('img', { name: '4 of 5 stars' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('does not ask for a rating when closing failed', async () => {
    const { user } = await renderTicket()
    server.use(
      http.patch(`${API}/tickets/42/status`, () =>
        HttpResponse.json({ message: 'The ticket changed in the meantime' }, { status: 409 }),
      ),
    )

    await user.click(screen.getByRole('button', { name: 'Close' }))

    expect(await screen.findByText('The ticket changed in the meantime')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows none of it while the backend has no ratings (no `rating` field)', async () => {
    const { rating: _, ...withoutRating } = ticketWith()
    const { user } = await renderTicket({ ticket: withoutRating })

    await user.click(screen.getByRole('button', { name: 'Close' }))

    expect(await screen.findByText('This ticket is closed. Reopen it if the problem came back.')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(rateButton()).not.toBeInTheDocument()
  })
})
