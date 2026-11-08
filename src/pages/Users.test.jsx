// Users.test.jsx – the Users page: who can open it, what HR may do, the "Add user" form, and the one-time
// temporary password dialog. The API is mocked with MSW; POST /users answers like the backend (PR #5).
import { act, screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import App from '../App'
import { buildUser } from '../test/factories'
import { renderWithProviders } from '../test/render'
import { API, deferred, server } from '../test/server'
import Users from './Users'

const admin = buildUser({ name: 'Admin User', role: 'admin', email: 'admin@ticketflow.local' })
const hr = buildUser({ name: 'Hana Rexhepi', role: 'hr', email: 'hr@ticketflow.local' })
const agent = buildUser({ name: 'Arben Krasniqi', role: 'agent', email: 'agent1@ticketflow.local' })
const employee = buildUser({ name: 'Liridon Gashi', role: 'employee', email: 'employee1@ticketflow.local' })
const inactiveEmployee = buildUser({ name: 'Vjosa Hoxha', role: 'employee', email: 'employee2@ticketflow.local', is_active: false })
const USERS = [admin, hr, agent, employee, inactiveEmployee]

const NEW_USER = { name: 'Besa Morina', email: 'besa.morina@ticketflow.local', department: 'Sales' }
const TEMP_PASSWORD = 'Xq7mK2pRt9wLzA'

// GET /users plus a POST /users that answers like the backend. Returns the request bodies it received.
function mockApi({ users = USERS, create } = {}) {
  const posted = []
  server.use(
    http.get(`${API}/users`, () => HttpResponse.json(users)),
    http.post(`${API}/users`, async ({ request }) => {
      const body = await request.json()
      posted.push(body)
      if (create) return create(body)
      return HttpResponse.json(
        {
          user: { id: 9001, ...body, is_active: true, must_change_password: true, created_at: new Date().toISOString() },
          temporaryPassword: TEMP_PASSWORD,
        },
        { status: 201 },
      )
    }),
  )
  return posted
}

function renderUsers(me = admin, options = {}) {
  return renderWithProviders(<Users />, { route: '/admin/users', user: me, ...options })
}

// Opens the form and waits for the table, so both are ready
async function openForm(user) {
  await screen.findByRole('table')
  await user.click(screen.getByRole('button', { name: 'Add user' }))
  return screen.findByRole('dialog', { name: 'Add user' })
}

async function fillForm(user, dialog, values = NEW_USER) {
  const field = (label) => within(dialog).getByLabelText(label)
  if (values.name) await user.type(field('Full name'), values.name)
  if (values.email) await user.type(field('Email'), values.email)
  if (values.department) await user.type(field(/Department/), values.department)
}

const rowFor = (name) => screen.getByRole('cell', { name: new RegExp(name) }).closest('tr')

describe('Users page access (real App routes)', () => {
  beforeEach(() => {
    mockApi()
    server.use(http.get(`${API}/tickets`, () => HttpResponse.json([])))
  })

  const renderApp = (me) => renderWithProviders(null, { route: '/admin/users', routes: [{ path: '*', element: <App /> }], user: me })

  it.each([
    ['an admin', admin],
    ['HR', hr],
  ])('%s can open /admin/users', async (_, me) => {
    const { router } = renderApp(me)
    expect(await screen.findByRole('heading', { name: 'Users' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/admin/users')
  })

  it.each([
    ['an employee', employee, 'My tickets'],
    ['an agent', agent, 'All tickets'],
  ])('%s is sent to /tickets', async (_, me, heading) => {
    const { router } = renderApp(me)
    expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/tickets')
    expect(screen.queryByRole('link', { name: 'Users' })).not.toBeInTheDocument()
  })

  it('HR gets the Users link but not the Dashboard, and stays out of /admin', async () => {
    const { router } = renderWithProviders(null, { route: '/admin', routes: [{ path: '*', element: <App /> }], user: hr })
    expect(await screen.findByRole('heading', { name: 'My tickets' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/tickets')
    const nav = screen.getByRole('navigation', { name: 'Main' })
    expect(within(nav).getByRole('link', { name: 'Users' })).toBeInTheDocument()
    expect(within(nav).queryByRole('link', { name: 'Dashboard' })).not.toBeInTheDocument()
    // The top bar shows the HR role label
    expect(screen.getByText('HR', { selector: '.role-tag' })).toBeInTheDocument()
  })
})

describe('Users table', () => {
  it('admin gets a role dropdown (with HR) on every row except their own', async () => {
    mockApi()
    renderUsers(admin)
    await screen.findByRole('table')

    expect(within(rowFor('Admin User')).queryByRole('combobox')).not.toBeInTheDocument()
    const hrSelect = within(rowFor('Hana Rexhepi')).getByRole('combobox', { name: 'Role for Hana Rexhepi' })
    expect(hrSelect).toHaveValue('hr')
    expect(within(hrSelect).getAllByRole('option').map((o) => o.textContent)).toEqual(['Employee', 'IT Staff', 'HR', 'Admin'])
    expect(within(rowFor('Arben Krasniqi')).getByRole('button', { name: 'Deactivate' })).toBeInTheDocument()
  })

  it('HR sees no role dropdowns, and Activate/Deactivate only on employees', async () => {
    mockApi()
    renderUsers(hr)
    const table = await screen.findByRole('table')

    expect(within(table).queryAllByRole('combobox')).toHaveLength(0)
    expect(within(rowFor('Arben Krasniqi')).getByText('IT Staff')).toBeInTheDocument()
    expect(within(rowFor('Admin User')).getByText('Admin')).toBeInTheDocument()

    expect(within(rowFor('Liridon Gashi')).getByRole('button', { name: 'Deactivate' })).toBeInTheDocument()
    expect(within(rowFor('Vjosa Hoxha')).getByRole('button', { name: 'Activate' })).toBeInTheDocument()
    for (const name of ['Admin User', 'Arben Krasniqi', 'Hana Rexhepi']) {
      expect(within(rowFor(name)).queryByRole('button')).not.toBeInTheDocument()
    }
  })
})

describe('Add user form', () => {
  it('admin can pick any of the 4 roles, Employee by default', async () => {
    mockApi()
    const { user } = renderUsers(admin)
    const dialog = await openForm(user)

    const role = within(dialog).getByLabelText('Role')
    expect(role).toHaveValue('employee')
    expect(within(role).getAllByRole('option').map((o) => o.textContent)).toEqual(['Employee', 'IT Staff', 'HR', 'Admin'])
    // The name field gets focus first
    expect(within(dialog).getByLabelText('Full name')).toHaveFocus()
  })

  it('admin creates an IT Staff account with the chosen role', async () => {
    const posted = mockApi()
    const { user } = renderUsers(admin)
    const dialog = await openForm(user)
    await fillForm(user, dialog)
    await user.selectOptions(within(dialog).getByLabelText('Role'), 'IT Staff')
    await user.click(within(dialog).getByRole('button', { name: 'Create user' }))

    await screen.findByRole('alertdialog')
    expect(posted).toEqual([{ ...NEW_USER, role: 'agent' }])
  })

  it('HR sees only "Employee" as fixed text, and creates an employee', async () => {
    const posted = mockApi()
    const { user } = renderUsers(hr)
    const dialog = await openForm(user)

    expect(within(dialog).queryByRole('combobox')).not.toBeInTheDocument()
    expect(within(dialog).getByText('Employee')).toBeInTheDocument()
    expect(within(dialog).getByText('HR can only create employee accounts.')).toBeInTheDocument()

    await fillForm(user, dialog, { name: NEW_USER.name, email: NEW_USER.email })
    await user.click(within(dialog).getByRole('button', { name: 'Create user' }))
    await screen.findByRole('alertdialog')
    expect(posted).toEqual([{ name: NEW_USER.name, email: NEW_USER.email, role: 'employee', department: null }])
  })

  it('checks the required fields and the email format before sending', async () => {
    const posted = mockApi()
    const { user } = renderUsers(admin)
    const dialog = await openForm(user)

    await user.click(within(dialog).getByRole('button', { name: 'Create user' }))
    expect(within(dialog).getByLabelText('Full name')).toHaveAccessibleDescription('Name is required')
    expect(within(dialog).getByLabelText('Email')).toHaveAccessibleDescription('Email is required')

    await user.type(within(dialog).getByLabelText('Full name'), 'Besa')
    await user.type(within(dialog).getByLabelText('Email'), 'not-an-email')
    await user.click(within(dialog).getByRole('button', { name: 'Create user' }))
    expect(within(dialog).getByLabelText('Full name')).not.toHaveAttribute('aria-invalid')
    expect(within(dialog).getByLabelText('Email')).toHaveAccessibleDescription('Enter a valid email')
    expect(posted).toEqual([])
  })

  it("shows the backend's 400 field errors under the fields, and other errors in an alert", async () => {
    mockApi({
      create: () =>
        HttpResponse.json(
          {
            message: 'Department must be 100 characters or less',
            errors: [
              { field: 'department', message: 'Department must be 100 characters or less' },
              { field: 'name', message: 'Name must be 100 characters or less' },
              { field: 'nickname', message: 'nickname is not allowed' },
            ],
          },
          { status: 400 },
        ),
    })
    const { user } = renderUsers(admin)
    const dialog = await openForm(user)
    await fillForm(user, dialog)
    await user.click(within(dialog).getByRole('button', { name: 'Create user' }))

    expect(await within(dialog).findByText('Department must be 100 characters or less')).toBeInTheDocument()
    expect(within(dialog).getByLabelText(/Department/)).toHaveAccessibleDescription('Department must be 100 characters or less')
    expect(within(dialog).getByLabelText('Full name')).toHaveAccessibleDescription('Name must be 100 characters or less')
    expect(within(dialog).getByRole('alert')).toHaveTextContent('nickname is not allowed')
    // Nothing was created, so the form stays open with what was typed
    expect(within(dialog).getByLabelText('Email')).toHaveValue(NEW_USER.email)
  })

  it('shows a 409 under Email', async () => {
    mockApi({ create: () => HttpResponse.json({ message: 'An account with this email already exists' }, { status: 409 }) })
    const { user } = renderUsers(admin)
    const dialog = await openForm(user)
    await fillForm(user, dialog)
    await user.click(within(dialog).getByRole('button', { name: 'Create user' }))

    await waitFor(() =>
      expect(within(dialog).getByLabelText('Email')).toHaveAccessibleDescription('An account with this email already exists'),
    )
    expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows other failures (e.g. a 403) in an alert', async () => {
    mockApi({ create: () => HttpResponse.json({ message: 'HR can only create employee accounts' }, { status: 403 }) })
    const { user } = renderUsers(hr)
    const dialog = await openForm(user)
    await fillForm(user, dialog)
    await user.click(within(dialog).getByRole('button', { name: 'Create user' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('HR can only create employee accounts')
  })

  it('shows "Creating…" and blocks closing while it saves', async () => {
    const pending = deferred()
    mockApi({ create: async () => (await pending.promise, HttpResponse.json({ user: { id: 9001, ...NEW_USER, role: 'employee', is_active: true }, temporaryPassword: TEMP_PASSWORD }, { status: 201 })) })
    const { user } = renderUsers(admin)
    const dialog = await openForm(user)
    await fillForm(user, dialog)
    await user.click(within(dialog).getByRole('button', { name: 'Create user' }))

    expect(await within(dialog).findByRole('button', { name: 'Creating…' })).toBeDisabled()
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled()
    await user.keyboard('{Escape}')
    expect(screen.getByRole('dialog', { name: 'Add user' })).toBeInTheDocument()

    pending.resolve()
    expect(await screen.findByRole('alertdialog')).toBeInTheDocument()
  })

  it.each([
    ['Cancel', (user, dialog) => user.click(within(dialog).getByRole('button', { name: 'Cancel' }))],
    ['Escape', (user) => user.keyboard('{Escape}')],
  ])('%s closes the form without saving and returns focus to "Add user"', async (_, close) => {
    const posted = mockApi()
    const { user } = renderUsers(admin)
    const dialog = await openForm(user)
    await fillForm(user, dialog)
    await close(user, dialog)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(posted).toEqual([])
    expect(screen.getByRole('button', { name: 'Add user' })).toHaveFocus()
  })

  it('keeps Tab inside the form', async () => {
    mockApi()
    const { user } = renderUsers(admin)
    const dialog = await openForm(user)

    const createButton = within(dialog).getByRole('button', { name: 'Create user' })
    createButton.focus()
    await user.tab()
    expect(within(dialog).getByLabelText('Full name')).toHaveFocus()
    await user.tab({ shift: true })
    expect(createButton).toHaveFocus()
  })
})

describe('temporary password dialog', () => {
  // Creates NEW_USER as an admin and returns the password dialog
  async function createUser(options) {
    mockApi()
    const rendered = renderUsers(admin, options)
    const dialog = await openForm(rendered.user)
    await fillForm(rendered.user, dialog)
    await rendered.user.click(within(dialog).getByRole('button', { name: 'Create user' }))
    const passwordDialog = await screen.findByRole('alertdialog', { name: `${NEW_USER.name}'s account is ready` })
    return { ...rendered, passwordDialog }
  }

  it('shows the name, email, password and the warning; the new user is already in the table', async () => {
    const { passwordDialog } = await createUser()

    expect(within(passwordDialog).getByText(NEW_USER.email)).toBeInTheDocument()
    expect(within(passwordDialog).getByText(TEMP_PASSWORD).tagName).toBe('CODE')
    expect(passwordDialog).toHaveTextContent(
      'This password is shown only once. Give it to the user securely; they must change it at first login.',
    )
    expect(screen.queryByRole('dialog', { name: 'Add user' })).not.toBeInTheDocument()

    // Added to the list without reloading it, at the top
    expect(rowFor(NEW_USER.name)).toBeInTheDocument()
    expect(screen.getByText('6 users · 5 active')).toBeInTheDocument()
  })

  it('Copy puts the password on the clipboard and says "Copied" for 2 seconds', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const { user, passwordDialog } = await createUser({ userEventOptions: { advanceTimers: vi.advanceTimersByTime } })
    // userEvent.setup() installs a test clipboard on navigator, so spy on that one
    const writeText = vi.spyOn(navigator.clipboard, 'writeText')

    await user.click(within(passwordDialog).getByRole('button', { name: 'Copy' }))
    expect(writeText).toHaveBeenCalledWith(TEMP_PASSWORD)
    expect(within(passwordDialog).getByRole('button', { name: 'Copied' })).toBeInTheDocument()

    act(() => vi.advanceTimersByTime(2000))
    expect(within(passwordDialog).getByRole('button', { name: 'Copy' })).toBeInTheDocument()
  })

  it('says so when copying fails', async () => {
    const { user, passwordDialog } = await createUser()
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'))

    await user.click(within(passwordDialog).getByRole('button', { name: 'Copy' }))
    expect(await within(passwordDialog).findByRole('alert')).toHaveTextContent("Couldn't copy")
  })

  it('Escape does not close it; Done does, and the password is gone for good', async () => {
    const { user, passwordDialog } = await createUser()

    await user.keyboard('{Escape}')
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()

    await user.click(within(passwordDialog).getByRole('button', { name: 'Done' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(screen.queryByText(TEMP_PASSWORD)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add user' })).toHaveFocus()

    // Opening the form again starts empty and never shows the old password
    await user.click(screen.getByRole('button', { name: 'Add user' }))
    const dialog = await screen.findByRole('dialog', { name: 'Add user' })
    expect(within(dialog).getByLabelText('Full name')).toHaveValue('')
    expect(screen.queryByText(TEMP_PASSWORD)).not.toBeInTheDocument()
    expect(rowFor(NEW_USER.name)).toBeInTheDocument()
  })
})
