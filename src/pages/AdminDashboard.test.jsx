// AdminDashboard.test.jsx – the satisfaction numbers on the admin dashboard: the "Satisfaction" card and the agent
// table's column, with and without ratings, and nothing of it while the backend sends no `ratings`.
import { screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { buildUser } from '../test/factories'
import { renderWithProviders } from '../test/render'
import { API, server } from '../test/server'
import AdminDashboard from './AdminDashboard'

// recharts' ResponsiveContainer measures itself with ResizeObserver, which jsdom doesn't have
beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
})

function buildStats(overrides = {}) {
  return {
    total: 12,
    byStatus: [
      { status: 'open', count: 4 },
      { status: 'closed', count: 8 },
    ],
    byCategory: [{ name: 'Hardware', count: 12 }],
    byPriority: [{ name: 'Medium', count: 12, target_hours: 72, avg_hours: 10 }],
    trend: [{ week: '2026-W46', created: 12, resolved: 8 }],
    overdueCount: 0,
    avgResolutionHours: 10,
    resolvedCount: 8,
    byAgent: [
      { name: 'Arben Krasniqi', assigned: 5, resolved: 4, avg_hours: 8 },
      { name: 'Drita Berisha', assigned: 3, resolved: 2, avg_hours: 12 },
    ],
    ratings: {
      average: 4.25,
      count: 8,
      byAgent: [{ name: 'Arben Krasniqi', average: 4.5, count: 6 }],
    },
    ...overrides,
  }
}

async function renderDashboard(stats) {
  server.use(http.get(`${API}/stats`, () => HttpResponse.json(stats)))
  await renderWithProviders(<AdminDashboard />, { user: buildUser({ role: 'admin' }) })
  await screen.findByText('Total tickets')
}

const card = (label) => screen.getByText(label, { selector: '.stat-card__label' }).closest('.stat-card')
const agentTable = () => screen.getByRole('heading', { name: 'Agent performance' }).closest('section')
const agentRow = (name) => within(agentTable()).getByRole('row', { name: new RegExp(name) })

describe('Satisfaction on the admin dashboard', () => {
  it('shows the average rating out of 5 and how many ratings it is from', async () => {
    await renderDashboard(buildStats())

    expect(card('Satisfaction')).toHaveTextContent('4.3 / 5')
    expect(card('Satisfaction')).toHaveTextContent('From 8 ratings')
  })

  it('says "1 rating" for one', async () => {
    await renderDashboard(buildStats({ ratings: { average: 5, count: 1, byAgent: [] } }))

    expect(card('Satisfaction')).toHaveTextContent('5.0 / 5')
    expect(card('Satisfaction')).toHaveTextContent('From 1 rating')
  })

  it('shows a dash and "No ratings yet" before the first rating', async () => {
    await renderDashboard(buildStats({ ratings: { average: null, count: 0, byAgent: [] } }))

    expect(card('Satisfaction')).toHaveTextContent('—')
    expect(card('Satisfaction')).toHaveTextContent('No ratings yet')
  })

  it("gives each agent's average and count in the table, and a dash for an agent without ratings", async () => {
    await renderDashboard(buildStats())

    expect(within(agentTable()).getByRole('columnheader', { name: 'Satisfaction' })).toBeInTheDocument()
    const rated = within(agentRow('Arben Krasniqi')).getAllByRole('cell').at(-1)
    expect(rated).toHaveTextContent('4.5')
    expect(rated).toHaveTextContent('from 6 ratings')
    expect(within(agentRow('Drita Berisha')).getAllByRole('cell').at(-1)).toHaveTextContent('—')
  })

  it('leaves the card and the column out while the backend sends no ratings', async () => {
    const { ratings: _, ...withoutRatings } = buildStats()
    await renderDashboard(withoutRatings)

    expect(screen.queryByText('Satisfaction')).not.toBeInTheDocument()
    expect(within(agentTable()).getAllByRole('columnheader')).toHaveLength(4)
  })

  it('spans the empty-table message over the extra column', async () => {
    await renderDashboard(buildStats({ byAgent: [] }))

    expect(within(agentTable()).getByText('No active staff yet.')).toHaveAttribute('colspan', '5')
  })
})
