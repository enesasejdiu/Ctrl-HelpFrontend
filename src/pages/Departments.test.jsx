// Departments.test.jsx – the Departments page: who can open it, the list, Add, Rename and Delete (with the backend's
// refusals), and that the Add user form offers a department added here without a reload. The API is mocked with
// MSW and keeps its own list, answering like the backend's /departments routes.
import { screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import App from '../App'
import { DEPARTMENTS, buildUser } from '../test/factories'
import { renderWithProviders } from '../test/render'
import { API, server } from '../test/server'

const admin = buildUser({ name: 'Admin User', role: 'admin', email: 'admin@ticketflow.local' })
const hr = buildUser({ name: 'Hana Rexhepi', role: 'hr', email: 'hr@ticketflow.local' })
const agent = buildUser({ name: 'Arben Krasniqi', role: 'agent' })
const employee = buildUser({ name: 'Liridon Gashi', role: 'employee' })

const TAKEN = { message: 'A department with this name already exists', code: 'DEPARTMENT_NAME_TAKEN' }

// A /departments API backed by an in-memory list. Returns the list and every write request it received.
function mockDepartments(initial = DEPARTMENTS) {
  const state = { list: initial.map((d) => ({ ...d })), requests: [] }
  const taken = (name, exceptId) => state.list.some((d) => d.id !== exceptId && d.name.toLowerCase() === name.toLowerCase())
  let nextId = 100
  server.use(
    http.get(`${API}/departments`, () => HttpResponse.json(state.list)),
    http.post(`${API}/departments`, async ({ request }) => {
      const body = await request.json()
      state.requests.push(['POST', body])
      if (taken(body.name)) return HttpResponse.json(TAKEN, { status: 409 })
      const created = { id: nextId++, name: body.name, user_count: 0 }
      state.list.push(created)
      return HttpResponse.json(created, { status: 201 })
    }),
    http.patch(`${API}/departments/:id`, async ({ request, params }) => {
      const body = await request.json()
      const id = Number(params.id)
      state.requests.push(['PATCH', id, body])
      if (taken(body.name, id)) return HttpResponse.json(TAKEN, { status: 409 })
      const department = state.list.find((d) => d.id === id)
      department.name = body.name
      return HttpResponse.json(department)
    }),
    http.delete(`${API}/departments/:id`, ({ params }) => {
      const id = Number(params.id)
      state.requests.push(['DELETE', id])
      const department = state.list.find((d) => d.id === id)
      if (department.user_count > 0) {
        return HttpResponse.json(
          { message: 'Move the users out of this department before deleting it', code: 'DEPARTMENT_NOT_EMPTY', user_count: department.user_count },
          { status: 409 },
        )
      }
      state.list = state.list.filter((d) => d.id !== id)
      return new HttpResponse(null, { status: 204 })
    }),
    // For the pages a redirect or a nav link lands on
    http.get(`${API}/tickets`, () => HttpResponse.json([])),
    http.get(`${API}/users`, () => HttpResponse.json([admin, hr, agent, employee])),
  )
  return state
}

async function renderApp(me, route = '/admin/departments') {
  return renderWithProviders(null, { route, routes: [{ path: '*', element: <App /> }], user: me })
}

// Renders the page as an admin and waits for the table
async function renderPage(me = admin) {
  const result = await renderApp(me)
  await screen.findByRole('table')
  return result
}

// The table's rows as [name, user count]
function rows() {
  return within(screen.getByRole('table'))
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('cell').slice(0, 2).map((cell) => cell.textContent))
}

describe('Departments page', () => {
  describe('access', () => {
    it.each([
      ['an admin', admin],
      ['HR', hr],
    ])('%s can open it from the Departments link', async (_, me) => {
      mockDepartments()
      const { user, router } = await renderApp(me, '/tickets')

      const nav = await screen.findByRole('navigation', { name: 'Main' })
      await user.click(within(nav).getByRole('link', { name: 'Departments' }))

      expect(await screen.findByRole('heading', { name: 'Departments' })).toBeInTheDocument()
      expect(router.state.location.pathname).toBe('/admin/departments')
    })

    it.each([
      ['an employee', employee],
      ['an agent', agent],
    ])("%s can't open it and gets no link", async (_, me) => {
      mockDepartments()
      const { router } = await renderApp(me)

      await waitFor(() => expect(router.state.location.pathname).toBe('/tickets'))
      expect(screen.queryByRole('heading', { name: 'Departments' })).not.toBeInTheDocument()
      const nav = screen.getByRole('navigation', { name: 'Main' })
      expect(within(nav).queryByRole('link', { name: 'Departments' })).not.toBeInTheDocument()
    })
  })

  describe('list', () => {
    it('shows each department with its number of users', async () => {
      mockDepartments()
      await renderPage()

      expect(rows()).toEqual([
        ['Finance', '1'],
        ['IT', '2'],
        ['Sales', '0'],
      ])
      expect(screen.getByText('3 departments')).toBeInTheDocument()
    })

    it('shows "No departments yet" when there are none', async () => {
      mockDepartments([])
      await renderApp(admin)

      expect(await screen.findByText('No departments yet')).toBeInTheDocument()
      expect(screen.queryByRole('table')).not.toBeInTheDocument()
    })

    it('shows a loading state, then an error if the list cannot be loaded', async () => {
      mockDepartments()
      server.use(http.get(`${API}/departments`, () => HttpResponse.json({ message: 'Server error' }, { status: 500 })))
      await renderApp(admin)

      expect(screen.getByRole('status')).toHaveTextContent('Loading departments…')
      expect(await screen.findByRole('alert')).toHaveTextContent('Server error')
      expect(screen.getByText('Departments could not be loaded')).toBeInTheDocument()
    })
  })

  describe('add', () => {
    it('adds a department and puts it in the list, sorted by name', async () => {
      const api = mockDepartments()
      const { user } = await renderPage()

      await user.click(screen.getByRole('button', { name: 'Add department' }))
      const dialog = screen.getByRole('dialog', { name: 'Add department' })
      await user.type(within(dialog).getByLabelText('Name'), '  Human   Resources ')
      await user.click(within(dialog).getByRole('button', { name: 'Add department' }))

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      expect(api.requests).toEqual([['POST', { name: 'Human Resources' }]])
      expect(rows()).toEqual([
        ['Finance', '1'],
        ['Human Resources', '0'],
        ['IT', '2'],
        ['Sales', '0'],
      ])
    })

    it('requires a name', async () => {
      const api = mockDepartments()
      const { user } = await renderPage()

      await user.click(screen.getByRole('button', { name: 'Add department' }))
      const dialog = screen.getByRole('dialog', { name: 'Add department' })
      await user.type(within(dialog).getByLabelText('Name'), '   ')
      await user.click(within(dialog).getByRole('button', { name: 'Add department' }))

      expect(within(dialog).getByLabelText('Name')).toHaveAccessibleDescription('Name is required')
      expect(api.requests).toEqual([])
    })

    it("shows the backend's error under the field for a name that's taken", async () => {
      mockDepartments()
      const { user } = await renderPage()

      await user.click(screen.getByRole('button', { name: 'Add department' }))
      const dialog = screen.getByRole('dialog', { name: 'Add department' })
      await user.type(within(dialog).getByLabelText('Name'), 'sales')
      await user.click(within(dialog).getByRole('button', { name: 'Add department' }))

      const input = within(dialog).getByLabelText('Name')
      await waitFor(() => expect(input).toHaveAccessibleDescription(TAKEN.message))
      expect(input).toHaveAttribute('aria-invalid', 'true')
      expect(rows()).toHaveLength(3)
    })
  })

  describe('rename', () => {
    it('opens prefilled and renames the department in place', async () => {
      const api = mockDepartments()
      const { user } = await renderPage()

      await user.click(screen.getByRole('button', { name: 'Rename IT' }))
      const dialog = screen.getByRole('dialog', { name: 'Rename IT' })
      const input = within(dialog).getByLabelText('Name')
      expect(input).toHaveValue('IT')
      // Nothing changed yet, so there's nothing to save
      expect(within(dialog).getByRole('button', { name: 'Rename' })).toBeDisabled()

      await user.clear(input)
      await user.type(input, 'Operations')
      await user.click(within(dialog).getByRole('button', { name: 'Rename' }))

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      expect(api.requests).toEqual([['PATCH', 2, { name: 'Operations' }]])
      expect(rows()).toEqual([
        ['Finance', '1'],
        ['Operations', '2'],
        ['Sales', '0'],
      ])
    })

    it("shows the backend's error for a name another department has", async () => {
      mockDepartments()
      const { user } = await renderPage()

      await user.click(screen.getByRole('button', { name: 'Rename IT' }))
      const dialog = screen.getByRole('dialog', { name: 'Rename IT' })
      const input = within(dialog).getByLabelText('Name')
      await user.clear(input)
      await user.type(input, 'Finance')
      await user.click(within(dialog).getByRole('button', { name: 'Rename' }))

      await waitFor(() => expect(input).toHaveAccessibleDescription(TAKEN.message))
      expect(rows().map(([name]) => name)).toEqual(['Finance', 'IT', 'Sales'])
    })
  })

  describe('delete', () => {
    it('asks first, then removes an empty department', async () => {
      const api = mockDepartments()
      const { user } = await renderPage()

      await user.click(screen.getByRole('button', { name: 'Delete Sales' }))
      const dialog = screen.getByRole('alertdialog', { name: 'Delete department' })
      expect(dialog).toHaveTextContent("Delete Sales? This can't be undone.")
      await user.click(within(dialog).getByRole('button', { name: 'Delete' }))

      await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
      expect(api.requests).toEqual([['DELETE', 3]])
      expect(rows().map(([name]) => name)).toEqual(['Finance', 'IT'])
    })

    it('Cancel keeps the department', async () => {
      const api = mockDepartments()
      const { user } = await renderPage()

      await user.click(screen.getByRole('button', { name: 'Delete Sales' }))
      await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancel' }))

      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
      expect(api.requests).toEqual([])
      expect(rows()).toHaveLength(3)
    })

    it('is disabled, with a reason, while the department has users', async () => {
      mockDepartments()
      await renderPage()

      for (const name of ['Finance', 'IT']) {
        const button = screen.getByRole('button', { name: `Delete ${name}` })
        expect(button).toBeDisabled()
        expect(button).toHaveAccessibleDescription('Move its users to another department first')
        expect(button.parentElement).toHaveAttribute('title', 'Move its users to another department first')
      }
      expect(screen.getByRole('button', { name: 'Delete Sales' })).toBeEnabled()
    })

    it("shows the backend's error if someone joined the department meanwhile, and updates its count", async () => {
      const api = mockDepartments()
      const { user } = await renderPage()
      // Someone is put into Sales after the list loaded
      api.list.find((d) => d.name === 'Sales').user_count = 2

      await user.click(screen.getByRole('button', { name: 'Delete Sales' }))
      const dialog = screen.getByRole('alertdialog')
      await user.click(within(dialog).getByRole('button', { name: 'Delete' }))

      expect(await within(dialog).findByRole('alert')).toHaveTextContent(
        'Move the users out of this department before deleting it',
      )
      expect(within(dialog).getByRole('button', { name: 'Delete' })).toBeDisabled()
      expect(rows()).toContainEqual(['Sales', '2'])

      await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
      expect(screen.getByRole('button', { name: 'Delete Sales' })).toBeDisabled()
    })
  })

  it('the Add user form offers a department added here, without a reload', async () => {
    mockDepartments()
    const { user } = await renderPage()

    await user.click(screen.getByRole('button', { name: 'Add department' }))
    await user.type(screen.getByLabelText('Name'), 'Legal')
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Add department' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', { name: 'Users' }))
    await screen.findByRole('heading', { name: 'Users' })
    await user.click(screen.getByRole('button', { name: 'Add user' }))

    const select = within(screen.getByRole('dialog', { name: 'Add user' })).getByLabelText(/Department/)
    await waitFor(() => expect(select).toBeEnabled())
    expect(within(select).getByRole('option', { name: 'Legal' })).toBeInTheDocument()
  })
})
