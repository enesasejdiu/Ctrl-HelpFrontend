// Users.test.jsx – the Users page for admins and HR: creating accounts (with the one-time temporary password),
// resetting passwords, and what HR may and may not change.
import { screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { vi } from 'vitest'
import { buildUser } from '../test/factories'
import { renderWithProviders } from '../test/render'
import { API, server } from '../test/server'
import Users from './Users'

const admin = buildUser({ name: 'Admin User', email: 'admin@ticketflow.local', role: 'admin' })
const hr = buildUser({ name: 'Hana HR', email: 'hr@ticketflow.local', role: 'hr' })
const agent = buildUser({ name: 'Arben Krasniqi', email: 'agent1@ticketflow.local', role: 'agent', is_active: true })
const employee = buildUser({ name: 'Liridon Gashi', email: 'employee1@ticketflow.local', is_active: true })

function mockList(users = [admin, hr, agent, employee]) {
  server.use(http.get(`${API}/users`, () => HttpResponse.json(users)))
}

// Records each POST /users body and answers like the backend
function mockCreate(respond) {
  const requests = []
  server.use(
    http.post(`${API}/users`, async ({ request }) => {
      const body = await request.json()
      requests.push(body)
      if (respond) return respond(body)
      const user = buildUser({ ...body, is_active: true, must_change_password: true, created_at: new Date().toISOString() })
      return HttpResponse.json({ user, temporaryPassword: 'Tmp4Xk9Qa2Lm' }, { status: 201 })
    }),
  )
  return requests
}

function renderAs(me) {
  return renderWithProviders(<Users />, { route: '/admin/users', user: me })
}

const rowFor = (name) => screen.getByRole('cell', { name: new RegExp(name) }).closest('tr')

beforeEach(() => {
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})

describe('Users as admin', () => {
  it('creates an account and shows its temporary password once', async () => {
    mockList()
    const requests = mockCreate()
    const { user } = renderAs(admin)
    await screen.findByText('Liridon Gashi')

    await user.click(screen.getByRole('button', { name: 'New user' }))
    const form = screen.getByRole('form', { name: 'New user' })
    await user.type(within(form).getByLabelText('Name'), '  Teuta Krasniqi ')
    await user.type(within(form).getByLabelText('Work email'), 'teuta@ticketflow.local')
    await user.type(within(form).getByLabelText(/Department/), 'Sales')
    await user.selectOptions(within(form).getByLabelText('Role'), 'agent')
    await user.click(within(form).getByRole('button', { name: 'Create user' }))

    const notice = await screen.findByRole('status')
    expect(notice).toHaveTextContent('Account created for Teuta Krasniqi')
    expect(within(notice).getByLabelText('Temporary password')).toHaveTextContent('Tmp4Xk9Qa2Lm')
    expect(requests).toEqual([{ name: 'Teuta Krasniqi', email: 'teuta@ticketflow.local', role: 'agent', department: 'Sales' }])

    // The new account is in the list, marked until they choose their own password
    expect(within(rowFor('Teuta Krasniqi')).getByText('Temporary password')).toBeInTheDocument()
    expect(screen.queryByRole('form', { name: 'New user' })).not.toBeInTheDocument()

    await user.click(within(notice).getByRole('button', { name: 'Done' }))
    expect(screen.queryByText('Tmp4Xk9Qa2Lm')).not.toBeInTheDocument()
  })

  it('offers every role, including HR, when creating an account', async () => {
    mockList()
    const { user } = renderAs(admin)
    await screen.findByText('Liridon Gashi')
    await user.click(screen.getByRole('button', { name: 'New user' }))

    const options = within(screen.getByLabelText('Role')).getAllByRole('option').map((o) => o.textContent)
    expect(options).toEqual(['Employee', 'IT Staff', 'Admin', 'HR'])
  })

  it('checks the form before sending it', async () => {
    mockList()
    const requests = mockCreate()
    const { user } = renderAs(admin)
    await screen.findByText('Liridon Gashi')
    await user.click(screen.getByRole('button', { name: 'New user' }))

    await user.click(screen.getByRole('button', { name: 'Create user' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Name is required')

    await user.type(screen.getByLabelText('Name'), 'Teuta')
    await user.type(screen.getByLabelText('Work email'), 'not-an-email')
    await user.click(screen.getByRole('button', { name: 'Create user' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid email')
    expect(requests).toHaveLength(0)
  })

  it('shows the server error when the email is taken, and keeps the form', async () => {
    mockList()
    mockCreate(() => HttpResponse.json({ message: 'An account with this email already exists' }, { status: 409 }))
    const { user } = renderAs(admin)
    await screen.findByText('Liridon Gashi')
    await user.click(screen.getByRole('button', { name: 'New user' }))

    await user.type(screen.getByLabelText('Name'), 'Copy')
    await user.type(screen.getByLabelText('Work email'), 'employee1@ticketflow.local')
    await user.click(screen.getByRole('button', { name: 'Create user' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('An account with this email already exists')
    expect(screen.getByRole('form', { name: 'New user' })).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('resets a password after confirming, and shows the new temporary password', async () => {
    mockList()
    server.use(
      http.post(`${API}/users/${agent.id}/reset-password`, () =>
        HttpResponse.json({ user: { ...agent, must_change_password: true }, temporaryPassword: 'Rst7Pq3Wz8Yb' }),
      ),
    )
    const { user } = renderAs(admin)
    await screen.findByText('Arben Krasniqi')

    await user.click(screen.getByRole('button', { name: 'Reset password for Arben Krasniqi' }))

    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('Reset the password of Arben Krasniqi'))
    const notice = await screen.findByRole('status')
    expect(notice).toHaveTextContent('Password reset for Arben Krasniqi')
    expect(within(notice).getByLabelText('Temporary password')).toHaveTextContent('Rst7Pq3Wz8Yb')
    expect(within(rowFor('Arben Krasniqi')).getByText('Temporary password')).toBeInTheDocument()
  })

  it('does nothing when the reset is not confirmed', async () => {
    window.confirm.mockReturnValue(false)
    mockList()
    const { user } = renderAs(admin)
    await screen.findByText('Arben Krasniqi')

    // No reset-password handler: a request would fail the test (unhandled request)
    await user.click(screen.getByRole('button', { name: 'Reset password for Arben Krasniqi' }))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('can change roles but not its own account', async () => {
    mockList()
    renderAs(admin)
    await screen.findByText('Liridon Gashi')

    expect(within(rowFor('Liridon Gashi')).getByLabelText('Role for Liridon Gashi')).toBeInTheDocument()
    const ownRow = rowFor('Admin User')
    expect(within(ownRow).queryByRole('combobox')).not.toBeInTheDocument()
    expect(within(ownRow).queryByRole('button')).not.toBeInTheDocument()
  })
})

describe('Users as HR', () => {
  it('can only create employee accounts', async () => {
    mockList()
    const requests = mockCreate()
    const { user } = renderAs(hr)
    await screen.findByText('Liridon Gashi')

    await user.click(screen.getByRole('button', { name: 'New user' }))
    const role = screen.getByLabelText('Role')
    expect(role).toBeDisabled()
    expect(role).toHaveValue('employee')
    expect(screen.getByText('HR can create employee accounts. Ask an admin for other roles.')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Name'), 'New Starter')
    await user.type(screen.getByLabelText('Work email'), 'new.starter@ticketflow.local')
    await user.click(screen.getByRole('button', { name: 'Create user' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Account created for New Starter')
    expect(requests[0]).toMatchObject({ role: 'employee', department: null })
  })

  it('manages employees but never changes roles, and leaves other accounts alone', async () => {
    mockList()
    renderAs(hr)
    await screen.findByText('Liridon Gashi')

    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()

    const employeeRow = rowFor('Liridon Gashi')
    expect(within(employeeRow).getByText('Employee')).toBeInTheDocument()
    expect(within(employeeRow).getByRole('button', { name: 'Reset password for Liridon Gashi' })).toBeInTheDocument()
    expect(within(employeeRow).getByRole('button', { name: 'Deactivate' })).toBeInTheDocument()

    for (const name of ['Arben Krasniqi', 'Admin User', 'Hana HR']) {
      expect(within(rowFor(name)).queryByRole('button')).not.toBeInTheDocument()
    }
    expect(within(rowFor('Hana HR')).getByText('HR')).toBeInTheDocument()
  })
})
