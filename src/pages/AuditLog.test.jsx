// AuditLog.test.jsx – the audit log page (/admin/audit): filters kept in the URL and sent to GET /audit, the table
// (labels, summaries, "—" for a missing actor or target, warnings), pagination, the loading/empty/error states, and
// that only admins get in.
import { screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import App from '../App'
import { buildUser } from '../test/factories'
import { currentParams, renderWithProviders } from '../test/render'
import { API, deferred, server } from '../test/server'
import AuditLog from './AuditLog'

const admin = buildUser({ id: 1, name: 'Ada Admin', role: 'admin' })
const ACTION_NAMES = [
  'login_success',
  'login_failure',
  'account_locked',
  'logout',
  'logout_all',
  'password_changed',
  'password_reset',
  'user_created',
  'user_updated',
  'role_changed',
  'user_activated',
  'user_deactivated',
]
const USERS = [
  buildUser({ id: 12, name: 'Teuta Krasniqi' }),
  buildUser({ id: 1, name: 'Ada Admin', role: 'admin' }),
  buildUser({ id: 7, name: 'Bob Agent', role: 'agent' }),
]

let nextId = 1
function entry(overrides = {}) {
  return {
    id: nextId++,
    created_at: '2026-11-10T16:02:45.000Z',
    action: 'login_success',
    actor: { id: 12, name: 'Teuta Krasniqi' },
    target: { id: 12, name: 'Teuta Krasniqi' },
    details: { email: 'teuta@ticketflow.local' },
    ip: '203.0.113.7',
    ...overrides,
  }
}

// Answers GET /audit like the backend and records every query string it was asked
function mockAudit(respond = () => ({ entries: [entry()], total: 1 })) {
  const queries = []
  server.use(
    http.get(`${API}/audit/actions`, () => HttpResponse.json(ACTION_NAMES)),
    http.get(`${API}/users`, () => HttpResponse.json(USERS)),
    http.get(`${API}/audit`, ({ request }) => {
      const params = Object.fromEntries(new URL(request.url).searchParams)
      queries.push(params)
      const body = respond(params)
      if (body instanceof Response) return body
      return HttpResponse.json({ page: Number(params.page || 1), pageSize: Number(params.pageSize || 25), ...body })
    }),
  )
  return queries
}

async function renderPage(route = '/admin/audit') {
  const result = await renderWithProviders(<AuditLog />, { route, path: '/admin/audit', user: admin })
  await screen.findByRole('table')
  return result
}

const rows = () => within(screen.getByRole('table')).getAllByRole('row').slice(1)
const cells = (row) =>
  within(row)
    .getAllByRole('cell')
    .map((cell) => cell.textContent)

describe('AuditLog', () => {
  describe('filters', () => {
    it('loads the first page with the default page size and no filters', async () => {
      const queries = mockAudit()
      await renderPage()
      expect(queries).toEqual([{ pageSize: '25' }])
    })

    it('user: the dropdown lists users by name and sends ?user=<id>', async () => {
      const queries = mockAudit()
      const { user, router } = await renderPage()
      const select = screen.getByRole('combobox', { name: 'User' })
      await waitFor(() => expect(within(select).getAllByRole('option')).toHaveLength(4))
      expect(
        within(select)
          .getAllByRole('option')
          .map((o) => o.textContent),
      ).toEqual(['All users', 'Ada Admin', 'Bob Agent', 'Teuta Krasniqi'])

      await user.selectOptions(select, 'Teuta Krasniqi')
      await waitFor(() => expect(queries.at(-1)).toEqual({ user: '12', pageSize: '25' }))
      expect(currentParams(router)).toEqual({ user: '12' })
    })

    it('action: readable labels in the dropdown, the action name in the query', async () => {
      const queries = mockAudit()
      const { user } = await renderPage()
      const select = screen.getByRole('combobox', { name: 'Action' })
      await waitFor(() => expect(within(select).getByRole('option', { name: 'Login failed' })).toBeInTheDocument())
      expect(within(select).getAllByRole('option')).toHaveLength(ACTION_NAMES.length + 1)

      await user.selectOptions(select, 'Login failed')
      await waitFor(() => expect(queries.at(-1)).toEqual({ action: 'login_failure', pageSize: '25' }))
    })

    it('from and to dates', async () => {
      const queries = mockAudit()
      const { user } = await renderPage()
      await user.type(screen.getByLabelText('From'), '2026-11-01')
      await user.type(screen.getByLabelText('To'), '2026-11-10')
      await waitFor(() => expect(queries.at(-1)).toEqual({ from: '2026-11-01', to: '2026-11-10', pageSize: '25' }))
    })

    it('starts from the filters in the URL, and "Clear filters" removes them all', async () => {
      const queries = mockAudit()
      const { user, router } = await renderPage(
        '/admin/audit?user=12&action=role_changed&from=2026-11-01&to=2026-11-02&page=2',
      )
      expect(queries[0]).toEqual({
        user: '12',
        action: 'role_changed',
        from: '2026-11-01',
        to: '2026-11-02',
        page: '2',
        pageSize: '25',
      })
      expect(screen.getByRole('combobox', { name: 'Action' })).toHaveValue('role_changed')
      expect(screen.getByLabelText('From')).toHaveValue('2026-11-01')

      await user.click(screen.getByRole('button', { name: 'Clear filters' }))
      await waitFor(() => expect(queries.at(-1)).toEqual({ pageSize: '25' }))
      expect(currentParams(router)).toEqual({})
    })

    it('changing a filter goes back to page 1', async () => {
      const queries = mockAudit(() => ({ entries: [entry()], total: 60 }))
      const { user, router } = await renderPage('/admin/audit?page=3')
      await user.selectOptions(screen.getByRole('combobox', { name: 'Action' }), 'Signed in')
      await waitFor(() => expect(queries.at(-1)).toEqual({ action: 'login_success', pageSize: '25' }))
      expect(currentParams(router)).toEqual({ action: 'login_success' })
    })
  })

  describe('the table', () => {
    it('shows time, action label, actor, target, summary and IP', async () => {
      mockAudit(() => ({
        entries: [
          entry({
            action: 'role_changed',
            actor: { id: 1, name: 'Ada Admin' },
            target: { id: 12, name: 'Teuta Krasniqi' },
            details: { from: 'employee', to: 'agent' },
          }),
        ],
        total: 1,
      }))
      await renderPage()
      const [row] = rows()
      const [time, ...rest] = cells(row)
      expect(rest).toEqual(['Role changed', 'Ada Admin', 'Teuta Krasniqi', 'Employee → IT Staff', '203.0.113.7'])
      expect(time).toMatch(/ago|\d{4}/)
      // The full date on hover
      expect(within(row).getAllByRole('cell')[0]).toHaveAttribute('title', expect.stringMatching(/Nov 2026/))
    })

    it('a missing actor, target, summary or IP shows "—"', async () => {
      mockAudit(() => ({
        entries: [
          entry({
            action: 'login_failure',
            actor: null,
            target: null,
            details: { email: 'nobody@x.com', reason: 'unknown_email' },
          }),
          entry({ action: 'user_deactivated', details: null, ip: null }),
        ],
        total: 2,
      }))
      await renderPage()
      const [failed, deactivated] = rows().map(cells)
      expect(failed.slice(1)).toEqual(['Login failed', '—', '—', 'Unknown email: nobody@x.com', '203.0.113.7'])
      expect(deactivated.slice(4)).toEqual(['—', '—'])
    })

    it('failed logins and lockouts are shown as warnings, other events are not', async () => {
      mockAudit(() => ({
        entries: [
          entry({ action: 'login_failure', details: { email: 'a@x.com', reason: 'wrong_password' } }),
          entry({ action: 'account_locked', details: { email: 'a@x.com', minutes: 15 } }),
          entry({ action: 'login_success' }),
        ],
        total: 3,
      }))
      await renderPage()
      expect(rows().map((row) => row.classList.contains('is-warning'))).toEqual([true, true, false])
    })

    it.each([
      ['user_updated', { fields: ['name', 'email'] }, 'User edited', 'Fields: name, email'],
      ['login_failure', { email: 'a@x.com', reason: 'wrong_password' }, 'Login failed', 'Wrong password'],
      ['password_reset', { sessions_ended: 2 }, 'Password reset', '2 sessions ended'],
    ])('%s shows "%s" … "%s"', async (action, details, label, summary) => {
      mockAudit(() => ({ entries: [entry({ action, details })], total: 1 }))
      await renderPage()
      const [, shownLabel, , , shownSummary] = cells(rows()[0])
      expect([shownLabel, shownSummary]).toEqual([label, summary])
    })
  })

  describe('pagination', () => {
    it('"Page X of Y" from total and pageSize; Previous/Next move one page and keep the filters', async () => {
      const queries = mockAudit(() => ({ entries: [entry()], total: 60 }))
      const { user, router } = await renderPage('/admin/audit?action=login_success')
      expect(screen.getByText('Page 1 of 3')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled()
      expect(screen.getByText('60 events')).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: 'Next' }))
      await screen.findByText('Page 2 of 3')
      expect(queries.at(-1)).toEqual({ action: 'login_success', page: '2', pageSize: '25' })
      expect(currentParams(router)).toEqual({ action: 'login_success', page: '2' })

      await user.click(screen.getByRole('button', { name: 'Next' }))
      await screen.findByText('Page 3 of 3')
      expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()

      await user.click(screen.getByRole('button', { name: 'Previous' }))
      await screen.findByText('Page 2 of 3')
    })

    it('a single page: both buttons disabled', async () => {
      mockAudit(() => ({ entries: [entry()], total: 1 }))
      await renderPage()
      expect(screen.getByText('Page 1 of 1')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
    })
  })

  describe('states', () => {
    it('shows a loading state until the first page arrives', async () => {
      const pending = deferred()
      server.use(
        http.get(`${API}/audit/actions`, () => HttpResponse.json(ACTION_NAMES)),
        http.get(`${API}/users`, () => HttpResponse.json(USERS)),
        http.get(`${API}/audit`, async () => {
          await pending.promise
          return HttpResponse.json({ entries: [entry()], total: 1, page: 1, pageSize: 25 })
        }),
      )
      await renderWithProviders(<AuditLog />, { route: '/admin/audit', user: admin })
      expect(screen.getByRole('status')).toHaveTextContent('Loading events…')
      pending.resolve()
      expect(await screen.findByRole('table')).toBeInTheDocument()
    })

    it('no events with filters: "No events match these filters" and a way to clear them', async () => {
      mockAudit(() => ({ entries: [], total: 0 }))
      const { user, router } = await renderWithProviders(<AuditLog />, {
        route: '/admin/audit?action=account_locked',
        path: '/admin/audit',
        user: admin,
      })
      expect(await screen.findByText('No events match these filters')).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Clear filters' }))
      await waitFor(() => expect(currentParams(router)).toEqual({}))
    })

    it('no events at all: says so, without a "Clear filters" button', async () => {
      mockAudit(() => ({ entries: [], total: 0 }))
      await renderWithProviders(<AuditLog />, { route: '/admin/audit', user: admin })
      expect(await screen.findByText('No events recorded yet')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument()
    })

    it("shows the backend's error message", async () => {
      mockAudit(() => HttpResponse.json({ message: 'Page size must be at most 100' }, { status: 400 }))
      await renderWithProviders(<AuditLog />, { route: '/admin/audit', user: admin })
      expect(await screen.findByRole('alert')).toHaveTextContent('Page size must be at most 100')
    })
  })

  describe('access', () => {
    it.each(['hr', 'agent', 'employee'])('%s is sent to the ticket list', async (role) => {
      server.use(http.get(`${API}/tickets`, () => HttpResponse.json([])))
      const { router } = await renderWithProviders(null, {
        route: '/admin/audit',
        routes: [{ path: '*', element: <App /> }],
        user: buildUser({ role }),
      })
      await waitFor(() => expect(router.state.location.pathname).toBe('/tickets'))
    })

    it('an admin gets the page, and "Audit log" in the menu', async () => {
      mockAudit()
      server.use(http.get(`${API}/tickets`, () => HttpResponse.json([])))
      const { router } = await renderWithProviders(null, {
        route: '/admin/audit',
        routes: [{ path: '*', element: <App /> }],
        user: admin,
      })
      expect(await screen.findByRole('heading', { name: 'Audit log' })).toBeInTheDocument()
      expect(router.state.location.pathname).toBe('/admin/audit')
      const nav = screen.getByRole('navigation', { name: 'Main' })
      expect(within(nav).getByRole('link', { name: 'Audit log' })).toHaveAttribute('href', '/admin/audit')
    })
  })
})
