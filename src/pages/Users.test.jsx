// Users.test.jsx – the Users page: who can open it, what HR may do, the "Add user" and "Edit user" forms,
// "Reset password", and how a password is delivered: with email set up (password_delivery 'email') the page says a
// link was emailed and offers "Resend link"; without, the temporary password is shown once. The API is mocked with
// MSW and answers like the backend (GET /meta, POST /users, PATCH /users/:id, POST /users/:id/reset-password,
// POST /users/:id/resend-link).
import { act, screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { useAuth } from '../context/auth'
import App from '../App'
import { DEPARTMENTS, buildMeta, buildUser } from '../test/factories'
import { currentParams, renderWithProviders } from '../test/render'
import { API, deferred, server } from '../test/server'
import Users from './Users'

const admin = buildUser({ name: 'Admin User', role: 'admin', email: 'admin@ticketflow.local' })
const hr = buildUser({ name: 'Hana Rexhepi', role: 'hr', email: 'hr@ticketflow.local' })
const agent = buildUser({ name: 'Arben Krasniqi', role: 'agent', email: 'agent1@ticketflow.local' })
const employee = buildUser({ name: 'Liridon Gashi', role: 'employee', email: 'employee1@ticketflow.local' })
const inactiveEmployee = buildUser({
  name: 'Vjosa Hoxha',
  role: 'employee',
  email: 'employee2@ticketflow.local',
  is_active: false,
})
const USERS = [admin, hr, agent, employee, inactiveEmployee]

const NEW_USER = { name: 'Besa Morina', email: 'besa.morina@ticketflow.local', department: 'Sales' } // picked by name

// The department name the backend joins in for an id
const departmentName = (id) => DEPARTMENTS.find((d) => d.id === id)?.name ?? null
const TEMP_PASSWORD = 'Xq7mK2pRt9wLzA'
// What the page says when a password went out by email
const invitedNotice = (u = NEW_USER) => `A link to set the password was emailed to ${u.email}. It expires in 48 hours.`

// GET /users, GET /meta and a POST /users that answer like the backend. `delivery` is how the backend delivers
// passwords: 'email' (email set up) or 'temporary_password'. Returns the request bodies POST /users received.
// The paging part of every GET /users since the last mockApi() ({ page, pageSize, sort?, order? })
let userPagingRequests = []

function mockApi({ users = USERS, create, delivery = 'email' } = {}) {
  const posted = []
  // Like the backend: users created by POST /users are in the next GET /users, newest first
  const all = [...users]
  userPagingRequests = []
  server.use(
    http.get(`${API}/users`, ({ request }) => {
      const params = new URL(request.url).searchParams
      userPagingRequests.push(Object.fromEntries([...params]))
      const sort = params.get('sort')
      const list = [...all]
      if (sort) {
        const key = sort === 'department' ? 'department_name' : sort
        const direction = params.get('order') === 'desc' ? -1 : 1
        list.sort((a, b) => String(a[key] ?? '').localeCompare(String(b[key] ?? '')) * direction)
      }
      const page = Number(params.get('page') || 1)
      const pageSize = Number(params.get('pageSize') || 25)
      return HttpResponse.json({
        items: list.slice((page - 1) * pageSize, page * pageSize),
        total: list.length,
        page,
        pageSize,
      })
    }),
    http.get(`${API}/meta`, () => HttpResponse.json(buildMeta({ password_delivery: delivery }))),
    http.post(`${API}/users`, async ({ request }) => {
      const body = await request.json()
      posted.push(body)
      if (create) return create(body)
      const user = {
        id: 9001,
        ...body,
        department_name: departmentName(body.department_id),
        is_active: true,
        must_change_password: true,
        created_at: new Date().toISOString(),
      }
      all.unshift(user)
      return HttpResponse.json(
        {
          user,
          ...(delivery === 'email' ? {} : { temporaryPassword: TEMP_PASSWORD }),
          password_delivery: delivery,
        },
        { status: 201 },
      )
    }),
  )
  return posted
}

// Shows the logged-in user's name as AuthProvider holds it (in memory only), so a test can see it change
function SessionName() {
  const { user } = useAuth()
  return <output data-testid="session-name">{user?.name}</output>
}

async function renderUsers(me = admin, options = {}) {
  return renderWithProviders(
    <>
      <Users />
      <SessionName />
    </>,
    { route: '/admin/users', user: me, ...options },
  )
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
  if (values.department) {
    // The options arrive from GET /departments after the dialog opens
    await within(dialog).findByRole('option', { name: values.department })
    await user.selectOptions(field(/Department/), values.department)
  }
}

const rowFor = (name) => screen.getByRole('cell', { name: new RegExp(name) }).closest('tr')

describe('Users page access (real App routes)', () => {
  beforeEach(() => {
    mockApi()
    server.use(http.get(`${API}/tickets`, () => HttpResponse.json([])))
  })

  const renderApp = (me) =>
    renderWithProviders(null, { route: '/admin/users', routes: [{ path: '*', element: <App /> }], user: me })

  it.each([
    ['an admin', admin],
    ['HR', hr],
  ])('%s can open /admin/users', async (_, me) => {
    const { router } = await renderApp(me)
    expect(await screen.findByRole('heading', { name: 'Users' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/admin/users')
  })

  it.each([
    ['an employee', employee, 'My tickets'],
    ['an agent', agent, 'All tickets'],
  ])('%s is sent to /tickets', async (_, me, heading) => {
    const { router } = await renderApp(me)
    expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/tickets')
    expect(screen.queryByRole('link', { name: 'Users' })).not.toBeInTheDocument()
  })

  it('HR gets the Users link but not the Dashboard, and stays out of /admin', async () => {
    const { router } = await renderWithProviders(null, {
      route: '/admin',
      routes: [{ path: '*', element: <App /> }],
      user: hr,
    })
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
    await renderUsers(admin)
    await screen.findByRole('table')

    expect(within(rowFor('Admin User')).queryByRole('combobox')).not.toBeInTheDocument()
    const hrSelect = within(rowFor('Hana Rexhepi')).getByRole('combobox', { name: 'Role for Hana Rexhepi' })
    expect(hrSelect).toHaveValue('hr')
    expect(
      within(hrSelect)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Employee', 'IT Staff', 'HR', 'Admin'])
    expect(within(rowFor('Arben Krasniqi')).getByRole('button', { name: 'Deactivate' })).toBeInTheDocument()
  })

  it('HR sees no role dropdowns, and Activate/Deactivate only on employees', async () => {
    mockApi()
    await renderUsers(hr)
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
    const { user } = await renderUsers(admin)
    const dialog = await openForm(user)

    const role = within(dialog).getByLabelText('Role')
    expect(role).toHaveValue('employee')
    expect(
      within(role)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Employee', 'IT Staff', 'HR', 'Admin'])
    // The name field gets focus first
    expect(within(dialog).getByLabelText('Full name')).toHaveFocus()
  })

  it('admin creates an IT Staff account with the chosen role', async () => {
    const posted = mockApi()
    const { user } = await renderUsers(admin)
    const dialog = await openForm(user)
    await fillForm(user, dialog)
    await user.selectOptions(within(dialog).getByLabelText('Role'), 'IT Staff')
    await user.click(within(dialog).getByRole('button', { name: 'Create user' }))

    await screen.findByText(invitedNotice())
    expect(posted).toEqual([{ name: NEW_USER.name, email: NEW_USER.email, department_id: 3, role: 'agent' }])
  })

  it('HR sees only "Employee" as fixed text, and creates an employee', async () => {
    const posted = mockApi()
    const { user } = await renderUsers(hr)
    const dialog = await openForm(user)

    expect(within(dialog).queryByRole('combobox', { name: 'Role' })).not.toBeInTheDocument()
    expect(within(dialog).getByText('Employee')).toBeInTheDocument()
    expect(within(dialog).getByText('HR can only create employee accounts.')).toBeInTheDocument()

    await fillForm(user, dialog, { name: NEW_USER.name, email: NEW_USER.email })
    await user.click(within(dialog).getByRole('button', { name: 'Create user' }))
    await screen.findByText(invitedNotice())
    expect(posted).toEqual([{ name: NEW_USER.name, email: NEW_USER.email, role: 'employee', department_id: null }])
  })

  it('checks the required fields and the email format before sending', async () => {
    const posted = mockApi()
    const { user } = await renderUsers(admin)
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
            message: 'Department not found',
            errors: [
              { field: 'department_id', message: 'Department not found' },
              { field: 'name', message: 'Name must be 100 characters or less' },
              { field: 'nickname', message: 'nickname is not allowed' },
            ],
          },
          { status: 400 },
        ),
    })
    const { user } = await renderUsers(admin)
    const dialog = await openForm(user)
    await fillForm(user, dialog)
    await user.click(within(dialog).getByRole('button', { name: 'Create user' }))

    expect(await within(dialog).findByText('Department not found')).toBeInTheDocument()
    expect(within(dialog).getByLabelText(/Department/)).toHaveAccessibleDescription('Department not found')
    expect(within(dialog).getByLabelText('Full name')).toHaveAccessibleDescription(
      'Name must be 100 characters or less',
    )
    expect(within(dialog).getByRole('alert')).toHaveTextContent('nickname is not allowed')
    // Nothing was created, so the form stays open with what was typed
    expect(within(dialog).getByLabelText('Email')).toHaveValue(NEW_USER.email)
  })

  it('shows a 409 under Email', async () => {
    mockApi({
      create: () => HttpResponse.json({ message: 'An account with this email already exists' }, { status: 409 }),
    })
    const { user } = await renderUsers(admin)
    const dialog = await openForm(user)
    await fillForm(user, dialog)
    await user.click(within(dialog).getByRole('button', { name: 'Create user' }))

    await waitFor(() =>
      expect(within(dialog).getByLabelText('Email')).toHaveAccessibleDescription(
        'An account with this email already exists',
      ),
    )
    expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows other failures (e.g. a 403) in an alert', async () => {
    mockApi({ create: () => HttpResponse.json({ message: 'HR can only create employee accounts' }, { status: 403 }) })
    const { user } = await renderUsers(hr)
    const dialog = await openForm(user)
    await fillForm(user, dialog)
    await user.click(within(dialog).getByRole('button', { name: 'Create user' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('HR can only create employee accounts')
  })

  it('shows "Creating…" and blocks closing while it saves', async () => {
    const pending = deferred()
    mockApi({
      create: async () => (
        await pending.promise,
        HttpResponse.json(
          { user: { id: 9001, ...NEW_USER, role: 'employee', is_active: true }, password_delivery: 'email' },
          { status: 201 },
        )
      ),
    })
    const { user } = await renderUsers(admin)
    const dialog = await openForm(user)
    await fillForm(user, dialog)
    await user.click(within(dialog).getByRole('button', { name: 'Create user' }))

    expect(await within(dialog).findByRole('button', { name: 'Creating…' })).toBeDisabled()
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled()
    await user.keyboard('{Escape}')
    expect(screen.getByRole('dialog', { name: 'Add user' })).toBeInTheDocument()

    pending.resolve()
    expect(await screen.findByText(invitedNotice())).toBeInTheDocument()
  })

  it.each([
    ['Cancel', (user, dialog) => user.click(within(dialog).getByRole('button', { name: 'Cancel' }))],
    ['Escape', (user) => user.keyboard('{Escape}')],
  ])('%s closes the form without saving and returns focus to "Add user"', async (_, close) => {
    const posted = mockApi()
    const { user } = await renderUsers(admin)
    const dialog = await openForm(user)
    await fillForm(user, dialog)
    await close(user, dialog)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(posted).toEqual([])
    expect(screen.getByRole('button', { name: 'Add user' })).toHaveFocus()
  })

  it('keeps Tab inside the form', async () => {
    mockApi()
    const { user } = await renderUsers(admin)
    const dialog = await openForm(user)

    const createButton = within(dialog).getByRole('button', { name: 'Create user' })
    createButton.focus()
    await user.tab()
    expect(within(dialog).getByLabelText('Full name')).toHaveFocus()
    await user.tab({ shift: true })
    expect(createButton).toHaveFocus()
  })
})

describe('after Add user (email not set up): the temporary password, shown once', () => {
  it('shows the name, email, password and the warning; the new user is already in the table', async () => {
    mockApi({ delivery: 'temporary_password' })
    const { user } = await renderUsers(admin)
    const dialog = await openForm(user)
    await fillForm(user, dialog)
    await user.click(within(dialog).getByRole('button', { name: 'Create user' }))

    const passwordDialog = await screen.findByRole('alertdialog', { name: `${NEW_USER.name}'s account is ready` })
    expect(within(passwordDialog).getByText(NEW_USER.email)).toBeInTheDocument()
    expect(within(passwordDialog).getByText(TEMP_PASSWORD).tagName).toBe('CODE')
    expect(passwordDialog).toHaveTextContent('This password is shown only once.')
    expect(screen.queryByText(invitedNotice())).not.toBeInTheDocument()
    expect(rowFor(NEW_USER.name)).toBeInTheDocument()
    // No email, so no "Resend link"
    expect(within(rowFor(NEW_USER.name)).queryByRole('button', { name: /Resend link/ })).not.toBeInTheDocument()
  })
})

describe('after Add user (email set up): the emailed link', () => {
  async function createUser(options) {
    mockApi()
    const rendered = await renderUsers(admin, options)
    const dialog = await openForm(rendered.user)
    await fillForm(rendered.user, dialog)
    await rendered.user.click(within(dialog).getByRole('button', { name: 'Create user' }))
    await screen.findByText(invitedNotice())
    return rendered
  }

  it('says where the link went; no password is shown, and the new user is already in the table', async () => {
    await createUser()

    // An info notice (role="status"), not a dialog: there is nothing secret to copy
    expect(screen.getByText(invitedNotice()).closest('[role="status"]')).toBeInTheDocument()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByText(/Temporary password/i)).not.toBeInTheDocument()

    // Added to the list without reloading it, at the top, with "Resend link" (it has no password yet)
    expect(rowFor(NEW_USER.name)).toBeInTheDocument()
    expect(
      within(rowFor(NEW_USER.name)).getByRole('button', { name: `Resend link to ${NEW_USER.name}` }),
    ).toBeInTheDocument()
    expect(await screen.findByText('Showing 1–6 of 6 · 5 active')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add user' })).toHaveFocus()
  })

  it('opening the form again clears the notice', async () => {
    const { user } = await createUser()
    await user.click(screen.getByRole('button', { name: 'Add user' }))
    await screen.findByRole('dialog', { name: 'Add user' })
    expect(screen.queryByText(invitedNotice())).not.toBeInTheDocument()
  })
})

// PATCH /users/:id and POST /users/:id/reset-password, answering like the backend. Returns what they received.
function mockEditAndReset({ patch, reset } = {}) {
  const calls = { patches: [], resets: [] }
  server.use(
    http.patch(`${API}/users/:id`, async ({ request, params }) => {
      const body = await request.json()
      calls.patches.push({ id: Number(params.id), body })
      if (patch) return patch(body)
      const current = USERS.find((u) => u.id === Number(params.id))
      const updated = { ...current, ...body, email: (body.email ?? current.email).toLowerCase() }
      return HttpResponse.json({ ...updated, department_name: departmentName(updated.department_id) })
    }),
    http.post(`${API}/users/:id/reset-password`, ({ params }) => {
      calls.resets.push(Number(params.id))
      if (reset) return reset()
      const current = USERS.find((u) => u.id === Number(params.id))
      return HttpResponse.json({
        user: { ...current, must_change_password: true },
        temporaryPassword: 'NewTemp42pass',
        password_delivery: 'temporary_password',
      })
    }),
  )
  return calls
}

async function openEdit(user, name) {
  await screen.findByRole('table')
  await user.click(within(rowFor(name)).getByRole('button', { name: `Edit ${name}` }))
  return screen.findByRole('dialog', { name: `Edit ${name}` })
}

describe('Edit and Reset password buttons', () => {
  it('admin: Edit on every row (own included), Reset on every row but their own', async () => {
    mockApi()
    await renderUsers(admin)
    await screen.findByRole('table')

    for (const u of USERS) {
      const row = rowFor(u.name)
      expect(within(row).getByRole('button', { name: `Edit ${u.name}` })).toBeInTheDocument()
      const reset = within(row).queryByRole('button', { name: `Reset password for ${u.name}` })
      if (u.id === admin.id) expect(reset).not.toBeInTheDocument()
      else expect(reset).toBeInTheDocument()
    }
  })

  it('HR: Edit and Reset only on employee rows', async () => {
    mockApi()
    await renderUsers(hr)
    await screen.findByRole('table')

    for (const u of USERS) {
      const row = rowFor(u.name)
      const isEmployee = u.role === 'employee'
      expect(Boolean(within(row).queryByRole('button', { name: `Edit ${u.name}` }))).toBe(isEmployee)
      expect(Boolean(within(row).queryByRole('button', { name: `Reset password for ${u.name}` }))).toBe(isEmployee)
    }
  })
})

describe('Edit user form', () => {
  it('admin: prefilled with name, email, department and role; focus on the name', async () => {
    mockApi()
    mockEditAndReset()
    const { user } = await renderUsers(admin)
    const dialog = await openEdit(user, agent.name)

    expect(within(dialog).getByLabelText('Full name')).toHaveValue(agent.name)
    expect(within(dialog).getByLabelText('Full name')).toHaveFocus()
    expect(within(dialog).getByLabelText('Email')).toHaveValue(agent.email)
    expect(within(dialog).getByLabelText(/Department/)).toHaveDisplayValue(agent.department_name)
    expect(within(dialog).getByLabelText('Role')).toHaveValue('agent')
    // Nothing changed yet, so there's nothing to save
    expect(within(dialog).getByRole('button', { name: 'Save changes' })).toBeDisabled()
  })

  it('sends only the fields that changed and updates the row without a reload', async () => {
    mockApi()
    const calls = mockEditAndReset()
    const { user } = await renderUsers(admin)
    const dialog = await openEdit(user, agent.name)

    await within(dialog).findByRole('option', { name: 'IT' })
    await user.selectOptions(within(dialog).getByLabelText(/Department/), 'IT')
    await user.selectOptions(within(dialog).getByLabelText('Role'), 'HR')
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(calls.patches).toEqual([{ id: agent.id, body: { department_id: 2, role: 'hr' } }])
    expect(within(rowFor(agent.name)).getByText('IT')).toBeInTheDocument()
    expect(within(rowFor(agent.name)).getByRole('combobox')).toHaveValue('hr')
    // Focus goes back to the row's Edit button
    expect(within(rowFor(agent.name)).getByRole('button', { name: `Edit ${agent.name}` })).toHaveFocus()
  })

  it('offers every department from GET /departments, plus No department', async () => {
    mockApi()
    mockEditAndReset()
    const { user } = await renderUsers(admin)
    const dialog = await openEdit(user, agent.name)

    await within(dialog).findByRole('option', { name: 'Sales' })
    const options = within(within(dialog).getByLabelText(/Department/))
      .getAllByRole('option')
      .map((o) => o.textContent)
    expect(options).toEqual(['No department', ...DEPARTMENTS.map((d) => d.name)])
  })

  it("if departments can't be loaded, keeps the current one and doesn't clear it on save", async () => {
    mockApi()
    const calls = mockEditAndReset()
    server.use(http.get(`${API}/departments`, () => HttpResponse.json({ message: 'Down' }, { status: 500 })))
    const { user } = await renderUsers(admin)
    const dialog = await openEdit(user, agent.name)

    expect(await within(dialog).findByText(/Departments could not be loaded/)).toBeInTheDocument()
    expect(within(dialog).getByLabelText(/Department/)).toHaveDisplayValue(agent.department_name)

    await user.type(within(dialog).getByLabelText('Full name'), ' Jr')
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(calls.patches).toEqual([{ id: agent.id, body: { name: `${agent.name} Jr` } }]))
  })

  it('choosing No department sends null', async () => {
    mockApi()
    const calls = mockEditAndReset()
    const { user } = await renderUsers(admin)
    const dialog = await openEdit(user, employee.name)

    await within(dialog).findByRole('option', { name: 'IT' }) // loaded
    await user.selectOptions(within(dialog).getByLabelText(/Department/), 'No department')
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(calls.patches).toEqual([{ id: employee.id, body: { department_id: null } }]))
  })

  it('HR edits an employee without a role field', async () => {
    mockApi()
    const calls = mockEditAndReset()
    const { user } = await renderUsers(hr)
    const dialog = await openEdit(user, employee.name)

    expect(within(dialog).queryByRole('combobox', { name: 'Role' })).not.toBeInTheDocument()
    expect(within(dialog).getByText('Only admins can change roles.')).toBeInTheDocument()
    await user.clear(within(dialog).getByLabelText('Full name'))
    await user.type(within(dialog).getByLabelText('Full name'), 'Liridon G.')
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(calls.patches).toEqual([{ id: employee.id, body: { name: 'Liridon G.' } }]))
    expect(await screen.findByRole('cell', { name: /Liridon G\./ })).toBeInTheDocument()
  })

  it('admin editing their own row: no role dropdown, and the logged-in user gets the new name', async () => {
    mockApi()
    const calls = mockEditAndReset()
    const { user } = await renderUsers(admin)
    const dialog = await openEdit(user, admin.name)

    expect(within(dialog).queryByRole('combobox', { name: 'Role' })).not.toBeInTheDocument()
    expect(within(dialog).getByText("You can't change your own role.")).toBeInTheDocument()
    await user.clear(within(dialog).getByLabelText('Full name'))
    await user.type(within(dialog).getByLabelText('Full name'), 'Head Admin')
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(calls.patches).toEqual([{ id: admin.id, body: { name: 'Head Admin' } }]))
    expect(await screen.findByTestId('session-name')).toHaveTextContent('Head Admin')
  })

  it("shows the backend's 400 field errors under the fields and a 409 under Email", async () => {
    mockApi()
    let answer = () =>
      HttpResponse.json(
        {
          message: 'Name must be 100 characters or less',
          errors: [{ field: 'name', message: 'Name must be 100 characters or less' }],
        },
        { status: 400 },
      )
    mockEditAndReset({ patch: () => answer() })
    const { user } = await renderUsers(admin)
    const dialog = await openEdit(user, employee.name)

    await user.type(within(dialog).getByLabelText('Full name'), ' Jr')
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))
    await waitFor(() =>
      expect(within(dialog).getByLabelText('Full name')).toHaveAccessibleDescription(
        'Name must be 100 characters or less',
      ),
    )

    answer = () => HttpResponse.json({ message: 'An account with this email already exists' }, { status: 409 })
    await user.clear(within(dialog).getByLabelText('Email'))
    await user.type(within(dialog).getByLabelText('Email'), agent.email)
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))
    await waitFor(() =>
      expect(within(dialog).getByLabelText('Email')).toHaveAccessibleDescription(
        'An account with this email already exists',
      ),
    )
    // The row keeps its saved values
    expect(within(rowFor(employee.name)).getByText(employee.email)).toBeInTheDocument()
  })

  it('shows other failures (e.g. 403) in an alert', async () => {
    mockApi()
    mockEditAndReset({
      patch: () => HttpResponse.json({ message: 'HR can only change employee accounts' }, { status: 403 }),
    })
    const { user } = await renderUsers(hr)
    const dialog = await openEdit(user, employee.name)
    await within(dialog).findByRole('option', { name: 'Sales' })
    await user.selectOptions(within(dialog).getByLabelText(/Department/), 'Sales')
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('HR can only change employee accounts')
  })

  it('Cancel and Escape close it without saving', async () => {
    mockApi()
    const calls = mockEditAndReset()
    const { user } = await renderUsers(admin)
    let dialog = await openEdit(user, agent.name)
    await user.type(within(dialog).getByLabelText('Full name'), ' changed')
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    dialog = await openEdit(user, agent.name)
    // Reopening starts from the saved values again
    expect(within(dialog).getByLabelText('Full name')).toHaveValue(agent.name)
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(calls.patches).toEqual([])
  })
})

describe('Reset password', () => {
  async function openReset(user, name) {
    await screen.findByRole('table')
    await user.click(within(rowFor(name)).getByRole('button', { name: `Reset password for ${name}` }))
    return screen.findByRole('alertdialog', { name: 'Reset password' })
  }

  it('asks first; Cancel (or Escape) resets nothing', async () => {
    mockApi()
    const calls = mockEditAndReset()
    const { user } = await renderUsers(admin)
    let confirm = await openReset(user, agent.name)

    expect(confirm).toHaveTextContent(
      `Reset ${agent.name}'s password? Their current password stops working immediately.`,
    )
    // Cancel has focus first, so Enter alone can't reset by accident
    expect(within(confirm).getByRole('button', { name: 'Cancel' })).toHaveFocus()
    await user.click(within(confirm).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()

    confirm = await openReset(user, agent.name)
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(calls.resets).toEqual([])
  })

  it('confirming shows "New password for <name>" with the email, password and Copy; Done clears it', async () => {
    mockApi()
    const calls = mockEditAndReset()
    const { user } = await renderUsers(hr)
    const confirm = await openReset(user, employee.name)
    await user.click(within(confirm).getByRole('button', { name: 'Reset password' }))

    const dialog = await screen.findByRole('alertdialog', { name: `New password for ${employee.name}` })
    expect(calls.resets).toEqual([employee.id])
    expect(within(dialog).getByText(employee.email)).toBeInTheDocument()
    expect(within(dialog).getByText('NewTemp42pass').tagName).toBe('CODE')
    expect(dialog).toHaveTextContent('This password is shown only once.')

    const writeText = vi.spyOn(navigator.clipboard, 'writeText')
    await user.click(within(dialog).getByRole('button', { name: 'Copy' }))
    expect(writeText).toHaveBeenCalledWith('NewTemp42pass')

    await user.click(within(dialog).getByRole('button', { name: 'Done' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(screen.queryByText('NewTemp42pass')).not.toBeInTheDocument()
    expect(
      within(rowFor(employee.name)).getByRole('button', { name: `Reset password for ${employee.name}` }),
    ).toHaveFocus()
  })

  it('shows "Resetting…" and blocks closing while the request runs', async () => {
    mockApi()
    const pending = deferred()
    mockEditAndReset({
      reset: async () => (
        await pending.promise,
        HttpResponse.json({ user: { ...agent, must_change_password: true }, temporaryPassword: 'Abc123def456' })
      ),
    })
    const { user } = await renderUsers(admin)
    const confirm = await openReset(user, agent.name)
    await user.click(within(confirm).getByRole('button', { name: 'Reset password' }))

    expect(await within(confirm).findByRole('button', { name: 'Resetting…' })).toBeDisabled()
    await user.keyboard('{Escape}')
    expect(screen.getByRole('alertdialog', { name: 'Reset password' })).toBeInTheDocument()
    pending.resolve()
    expect(await screen.findByRole('alertdialog', { name: `New password for ${agent.name}` })).toBeInTheDocument()
  })

  // Resets the agent's password as the admin and returns the password dialog
  async function resetAgent(options) {
    mockApi()
    mockEditAndReset()
    const rendered = await renderUsers(admin, options)
    const confirm = await openReset(rendered.user, agent.name)
    await rendered.user.click(within(confirm).getByRole('button', { name: 'Reset password' }))
    const passwordDialog = await screen.findByRole('alertdialog', { name: `New password for ${agent.name}` })
    return { ...rendered, passwordDialog }
  }

  it('Copy says "Copied" for 2 seconds', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const { user, passwordDialog } = await resetAgent({ userEventOptions: { advanceTimers: vi.advanceTimersByTime } })
    // userEvent.setup() installs a test clipboard on navigator, so spy on that one
    const writeText = vi.spyOn(navigator.clipboard, 'writeText')

    await user.click(within(passwordDialog).getByRole('button', { name: 'Copy' }))
    expect(writeText).toHaveBeenCalledWith('NewTemp42pass')
    expect(within(passwordDialog).getByRole('button', { name: 'Copied' })).toBeInTheDocument()

    act(() => vi.advanceTimersByTime(2000))
    expect(within(passwordDialog).getByRole('button', { name: 'Copy' })).toBeInTheDocument()
  })

  it('says so when copying fails', async () => {
    const { user, passwordDialog } = await resetAgent()
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'))

    await user.click(within(passwordDialog).getByRole('button', { name: 'Copy' }))
    expect(await within(passwordDialog).findByRole('alert')).toHaveTextContent("Couldn't copy")
  })

  it('Escape does not close the password dialog; Done does, and the password is gone for good', async () => {
    const { user, passwordDialog } = await resetAgent()

    await user.keyboard('{Escape}')
    expect(screen.getByRole('alertdialog', { name: `New password for ${agent.name}` })).toBeInTheDocument()

    await user.click(within(passwordDialog).getByRole('button', { name: 'Done' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(screen.queryByText('NewTemp42pass')).not.toBeInTheDocument()
  })

  it('with email set up, says the link was emailed and shows no password', async () => {
    mockApi()
    mockEditAndReset({
      reset: () => HttpResponse.json({ user: { ...employee, must_change_password: true }, password_delivery: 'email' }),
    })
    const { user } = await renderUsers(admin)
    const confirm = await openReset(user, employee.name)
    await user.click(within(confirm).getByRole('button', { name: 'Reset password' }))

    expect(await screen.findByText(invitedNotice(employee))).toBeInTheDocument()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(screen.queryByText(/Temporary password/i)).not.toBeInTheDocument()
    // The row now waits for the new password, so it offers a fresh link
    expect(
      within(rowFor(employee.name)).getByRole('button', { name: `Resend link to ${employee.name}` }),
    ).toBeInTheDocument()
  })

  it('shows a failed reset in the confirm dialog', async () => {
    mockApi()
    mockEditAndReset({
      reset: () => HttpResponse.json({ message: 'HR can only reset passwords of employee accounts' }, { status: 403 }),
    })
    const { user } = await renderUsers(hr)
    const confirm = await openReset(user, employee.name)
    await user.click(within(confirm).getByRole('button', { name: 'Reset password' }))
    expect(await within(confirm).findByRole('alert')).toHaveTextContent(
      'HR can only reset passwords of employee accounts',
    )
  })
})

describe('Job title', () => {
  const accountant = buildUser({
    name: 'Besa Morina',
    role: 'employee',
    email: 'besa@ticketflow.local',
    job_title: 'Accountant',
  })
  const LIST = [admin, accountant, employee]

  // GET /users with `accountant` in it, and a PATCH that answers like the backend: an empty job title is saved as null
  function mockJobTitleApi() {
    const patches = []
    mockApi({ users: LIST })
    server.use(
      http.patch(`${API}/users/:id`, async ({ request, params }) => {
        const body = await request.json()
        patches.push(body)
        const current = LIST.find((u) => u.id === Number(params.id))
        const updated = { ...current, ...body }
        if ('job_title' in body) updated.job_title = body.job_title || null
        return HttpResponse.json(updated)
      }),
    )
    return patches
  }

  it('the Users list shows the job title under the name', async () => {
    mockJobTitleApi()
    await renderUsers(admin)
    await screen.findByRole('table')

    expect(within(rowFor(accountant.name)).getByText('Accountant')).toHaveClass('person__job')
    // No job title, no extra line
    expect(rowFor(employee.name).querySelector('.person__job')).toBeNull()
  })

  it('Add user: optional field after Department, sent trimmed, and the new row shows it', async () => {
    const posted = mockApi()
    const { user } = await renderUsers(admin)
    const dialog = await openForm(user)

    const field = within(dialog).getByLabelText(/Job title/)
    expect(field).toHaveAttribute('placeholder', 'e.g. Accountant')
    expect(field).toHaveAttribute('maxLength', '100')
    expect(field).not.toBeRequired()
    // Right after Department in the form
    const labels = within(dialog).getAllByText(/^(Full name|Email|Department|Job title|Role)/, {
      selector: 'label, .field__label',
    })
    expect(labels.map((l) => l.textContent.replace('Optional', '').trim())).toEqual([
      'Full name',
      'Email',
      'Department',
      'Job title',
      'Role',
    ])

    await fillForm(user, dialog)
    await user.type(field, '  QA Tester ')
    await user.click(within(dialog).getByRole('button', { name: 'Create user' }))

    await screen.findByText(/A link to set the password was emailed to/)
    expect(posted).toEqual([
      { name: NEW_USER.name, email: NEW_USER.email, department_id: 3, job_title: 'QA Tester', role: 'employee' },
    ])
    expect(within(rowFor(NEW_USER.name)).getByText('QA Tester')).toBeInTheDocument()
  })

  it('Edit user: prefilled, sends only the job title when only it changed, and updates the row', async () => {
    const patches = mockJobTitleApi()
    const { user } = await renderUsers(admin)
    const dialog = await openEdit(user, accountant.name)

    const field = within(dialog).getByLabelText(/Job title/)
    expect(field).toHaveValue('Accountant')
    await user.clear(field)
    await user.type(field, 'Senior Accountant')
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(patches).toEqual([{ job_title: 'Senior Accountant' }])
    expect(within(rowFor(accountant.name)).getByText('Senior Accountant')).toBeInTheDocument()
  })

  it('Edit user: other changes leave the job title out', async () => {
    const patches = mockJobTitleApi()
    const { user } = await renderUsers(admin)
    const dialog = await openEdit(user, accountant.name)

    await user.type(within(dialog).getByLabelText('Full name'), ' Jr')
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(patches).toEqual([{ name: `${accountant.name} Jr` }]))
  })

  it('Edit user: clearing the job title sends an empty value, and the row loses it', async () => {
    const patches = mockJobTitleApi()
    const { user } = await renderUsers(admin)
    const dialog = await openEdit(user, accountant.name)

    await user.clear(within(dialog).getByLabelText(/Job title/))
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(patches).toEqual([{ job_title: '' }])
    expect(rowFor(accountant.name).querySelector('.person__job')).toBeNull()
  })

  it("shows the backend's job_title error under the field", async () => {
    mockJobTitleApi()
    server.use(
      http.patch(`${API}/users/:id`, () =>
        HttpResponse.json(
          {
            message: 'Job title must be 255 characters or less',
            errors: [{ field: 'job_title', message: 'Job title must be 255 characters or less' }],
          },
          { status: 400 },
        ),
      ),
    )
    const { user } = await renderUsers(admin)
    const dialog = await openEdit(user, accountant.name)

    await user.type(within(dialog).getByLabelText(/Job title/), ' Lead')
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))

    const field = within(dialog).getByLabelText(/Job title/)
    await waitFor(() => expect(field).toHaveAccessibleDescription('Job title must be 255 characters or less'))
    expect(field).toHaveAttribute('aria-invalid', 'true')
    expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument()
  })

  it('checks the 100-character limit before sending', async () => {
    const patches = mockJobTitleApi()
    const { user } = await renderUsers(admin)
    const dialog = await openEdit(user, accountant.name)

    // maxLength stops typing past 100; a value set some other way (e.g. by a browser extension) is still caught
    const field = within(dialog).getByLabelText(/Job title/)
    field.removeAttribute('maxLength')
    await user.clear(field)
    await user.type(field, 'x'.repeat(101))
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))

    expect(field).toHaveAccessibleDescription('Job title must be 100 characters or less')
    expect(patches).toEqual([])
  })
})

describe('Resend link', () => {
  // Have not set a password yet (e.g. just created)
  const invited = buildUser({
    name: 'Nora Invited',
    role: 'employee',
    email: 'nora@ticketflow.local',
    must_change_password: true,
  })
  const invitedAgent = buildUser({
    name: 'Ilir Invited',
    role: 'agent',
    email: 'ilir@ticketflow.local',
    must_change_password: true,
  })
  const invitedInactive = buildUser({
    name: 'Drita Inactive',
    role: 'employee',
    email: 'drita@ticketflow.local',
    must_change_password: true,
    is_active: false,
  })
  const LIST = [admin, invited, invitedAgent, invitedInactive, employee]
  const resendButton = (name) => within(rowFor(name)).queryByRole('button', { name: `Resend link to ${name}` })

  function mockResend(answer) {
    const calls = []
    server.use(
      http.post(`${API}/users/:id/resend-link`, ({ params }) => {
        calls.push(Number(params.id))
        if (answer) return answer()
        const current = LIST.find((u) => u.id === Number(params.id))
        return HttpResponse.json({ user: current, password_delivery: 'email' })
      }),
    )
    return calls
  }

  it('admin: only on active accounts that have not set a password yet', async () => {
    mockApi({ users: LIST })
    await renderUsers(admin)
    await screen.findByRole('table')
    expect(resendButton(invited.name)).toBeInTheDocument()
    expect(resendButton(invitedAgent.name)).toBeInTheDocument()
    expect(resendButton(invitedInactive.name)).not.toBeInTheDocument()
    expect(resendButton(employee.name)).not.toBeInTheDocument()
    expect(resendButton(admin.name)).not.toBeInTheDocument()
  })

  it('never when email is not set up', async () => {
    mockApi({ users: LIST, delivery: 'temporary_password' })
    await renderUsers(admin)
    await screen.findByRole('table')
    expect(resendButton(invited.name)).not.toBeInTheDocument()
    expect(resendButton(invitedAgent.name)).not.toBeInTheDocument()
  })

  it('HR: employees only', async () => {
    mockApi({ users: [hr, ...LIST] })
    await renderUsers(hr)
    await screen.findByRole('table')
    expect(resendButton(invited.name)).toBeInTheDocument()
    expect(resendButton(invitedAgent.name)).not.toBeInTheDocument()
  })

  it('sends POST /users/:id/resend-link and says a new link went out', async () => {
    mockApi({ users: LIST })
    const calls = mockResend()
    const { user } = await renderUsers(admin)
    await screen.findByRole('table')
    await user.click(resendButton(invited.name))

    expect(await screen.findByText(`${invitedNotice(invited)} The previous link no longer works.`)).toBeInTheDocument()
    expect(calls).toEqual([invited.id])
  })

  it("shows the backend's refusal (e.g. 409 the user already set a password)", async () => {
    mockApi({ users: LIST })
    mockResend(() =>
      HttpResponse.json(
        { message: 'This user has already set a password. Use Reset password instead', code: 'PASSWORD_ALREADY_SET' },
        { status: 409 },
      ),
    )
    const { user } = await renderUsers(admin)
    await screen.findByRole('table')
    await user.click(resendButton(invited.name))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This user has already set a password. Use Reset password instead',
    )
  })
})

// ---- Paging and sorting (GET /users?page=&pageSize=&sort=&order=) ----
describe('Users page: paging and sorting', () => {
  // 30 employees "User 01" … "User 30" plus the admin
  const MANY = [
    admin,
    ...Array.from({ length: 30 }, (_, i) =>
      buildUser({ name: `User ${String(i + 1).padStart(2, '0')}`, email: `user${i + 1}@ticketflow.local` }),
    ),
  ]
  const pager = () => screen.getByRole('navigation', { name: 'User pages' })
  const header = (name) => screen.getByRole('columnheader', { name: new RegExp(`^${name}`) })
  // The names in the table, in order (the name element, without the avatar's initials or the "You" tag)
  const names = () => [...screen.getByRole('table').querySelectorAll('tbody .table__title')].map((el) => el.textContent)

  it('asks for page 1 of 25 and shows "Showing 1–25 of 31" with the page controls', async () => {
    mockApi({ users: MANY })
    await renderUsers(admin)

    expect(await screen.findByText(/^Showing 1–25 of 31/)).toBeInTheDocument()
    expect(userPagingRequests[0]).toEqual({ page: '1', pageSize: '25' })
    expect(within(pager()).getByText('Page 1 of 2')).toBeInTheDocument()
  })

  it('Next, sorting by a column header and the page size, all in the URL', async () => {
    mockApi({ users: MANY })
    const { user, router } = await renderUsers(admin)
    await screen.findByText(/^Showing 1–25 of 31/)

    await user.click(within(pager()).getByRole('button', { name: 'Next' }))
    expect(await screen.findByText(/^Showing 26–31 of 31/)).toBeInTheDocument()
    expect(currentParams(router)).toEqual({ page: '2' })

    // Sorting goes back to page 1; Name sorts A–Z first, then Z–A
    await user.click(within(header('Name')).getByRole('button'))
    await waitFor(() => expect(currentParams(router)).toEqual({ sort: 'name', order: 'asc' }))
    expect(header('Name')).toHaveAttribute('aria-sort', 'ascending')
    await waitFor(() => expect(names()[0]).toBe('Admin User'))
    await user.click(within(header('Name')).getByRole('button'))
    await waitFor(() => expect(names()[0]).toBe('User 30'))
    expect(header('Name')).toHaveAttribute('aria-sort', 'descending')

    await user.selectOptions(within(pager()).getByLabelText('Per page'), '50')
    await waitFor(() => expect(currentParams(router)).toEqual({ sort: 'name', order: 'desc', pageSize: '50' }))
    expect(await screen.findByText(/^Showing 1–31 of 31/)).toBeInTheDocument()
  })

  it('Joined sorts newest first; Status is not sortable', async () => {
    mockApi({ users: MANY })
    const { user, router } = await renderUsers(admin)
    await screen.findByText(/^Showing 1–25 of 31/)

    await user.click(within(header('Joined')).getByRole('button'))
    await waitFor(() => expect(currentParams(router)).toEqual({ sort: 'created_at', order: 'desc' }))
    expect(within(header('Status')).queryByRole('button')).not.toBeInTheDocument()
  })

  it('the URL is used on load, and an empty page past the end goes to the last page', async () => {
    mockApi({ users: MANY })
    const { router } = await renderUsers(admin, { route: '/admin/users?page=9&sort=email&order=asc' })

    expect(await screen.findByText(/^Showing 26–31 of 31/)).toBeInTheDocument()
    expect(currentParams(router)).toEqual({ page: '2', sort: 'email', order: 'asc' })
    expect(userPagingRequests.map((r) => r.page)).toEqual(['9', '2'])
    expect(header('Email')).toHaveAttribute('aria-sort', 'ascending')
  })

  it("the backend's 400 is shown with its details", async () => {
    mockApi({ users: MANY })
    server.use(
      http.get(`${API}/users`, () =>
        HttpResponse.json(
          { message: 'Invalid query', errors: [{ field: 'pageSize', message: 'Page size must be 25, 50 or 100' }] },
          { status: 400 },
        ),
      ),
    )
    await renderUsers(admin)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Invalid query')
    expect(alert).toHaveTextContent('pageSize: Page size must be 25, 50 or 100')
    expect(within(alert).getByRole('button', { name: 'Reset sorting and pages' })).toBeInTheDocument()
  })
})
