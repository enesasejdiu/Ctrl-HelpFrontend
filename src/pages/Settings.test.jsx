// Settings.test.jsx – the admin Settings page (/admin/settings): who can open it, the company name (and where it shows:
// the top bar and the login page, with "TicketFlow" as the fallback), every category action and error, the priorities'
// target hours, and that archived categories aren't offered for new tickets but still show on old ones.
// The API is a small in-memory backend following the agreed contract.
import { screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import App from '../App'
import { PRIORITIES, buildTicket, buildUser } from '../test/factories'
import { renderWithProviders } from '../test/render'
import { API, server } from '../test/server'
import Login from './Login'
import NewTicket from './NewTicket'
import TicketDetail from './TicketDetail'
import TicketList from './TicketList'

const admin = buildUser({ id: 1, name: 'Admin User', role: 'admin' })

const startingCategories = () => [
  { id: 1, name: 'Hardware', description: 'Laptops and printers', is_active: true, ticket_count: 4 },
  { id: 2, name: 'Software', description: '', is_active: true, ticket_count: 0 },
  { id: 3, name: 'Old phones', description: 'Retired', is_active: false, ticket_count: 2 },
]

// The settings API in memory; `calls` records every write as [method, path, body]
function mockSettings({ companyName = 'Acme Ltd', categories = startingCategories(), fail = {} } = {}) {
  const state = { companyName, categories, priorities: PRIORITIES.map((p) => ({ ...p })), calls: [] }
  let nextId = 50
  const refuse = (key) => fail[key] && HttpResponse.json(fail[key].body, { status: fail[key].status })
  server.use(
    http.get(`${API}/settings/public`, () =>
      fail.public ? HttpResponse.json({}, { status: 500 }) : HttpResponse.json({ company_name: state.companyName }),
    ),
    http.get(`${API}/settings`, () => refuse('settings') || HttpResponse.json({ company_name: state.companyName })),
    http.patch(`${API}/settings`, async ({ request }) => {
      const body = await request.json()
      state.calls.push(['PATCH', '/settings', body])
      if (fail.saveSettings) return refuse('saveSettings')
      state.companyName = body.company_name
      return HttpResponse.json({ company_name: state.companyName })
    }),
    http.get(`${API}/meta`, () => HttpResponse.json({ categories: state.categories, priorities: state.priorities })),
    http.post(`${API}/categories`, async ({ request }) => {
      const body = await request.json()
      state.calls.push(['POST', '/categories', body])
      if (state.categories.some((c) => c.name.toLowerCase() === body.name.toLowerCase())) {
        return HttpResponse.json({ message: 'A category with this name already exists' }, { status: 409 })
      }
      if (fail.addCategory) return refuse('addCategory')
      const created = { id: nextId++, description: '', is_active: true, ticket_count: 0, ...body }
      state.categories.push(created)
      return HttpResponse.json(created, { status: 201 })
    }),
    http.patch(`${API}/categories/:id`, async ({ request, params }) => {
      const body = await request.json()
      state.calls.push(['PATCH', `/categories/${params.id}`, body])
      if (fail.patchCategory) return refuse('patchCategory')
      const category = state.categories.find((c) => c.id === Number(params.id))
      Object.assign(category, body)
      return HttpResponse.json(category)
    }),
    http.delete(`${API}/categories/:id`, ({ params }) => {
      state.calls.push(['DELETE', `/categories/${params.id}`])
      if (fail.deleteCategory) return refuse('deleteCategory')
      state.categories = state.categories.filter((c) => c.id !== Number(params.id))
      return new HttpResponse(null, { status: 204 })
    }),
    http.patch(`${API}/priorities/:id`, async ({ request, params }) => {
      const body = await request.json()
      state.calls.push(['PATCH', `/priorities/${params.id}`, body])
      if (fail.priority) return refuse('priority')
      const priority = state.priorities.find((p) => p.id === Number(params.id))
      priority.target_hours = body.target_hours
      return HttpResponse.json(priority)
    }),
    // What the other pages ask for
    http.get(`${API}/tickets`, () => HttpResponse.json([])),
  )
  return state
}

function renderApp(user = admin, route = '/admin/settings') {
  return renderWithProviders(null, { route, routes: [{ path: '*', element: <App /> }], user })
}

async function renderSettings() {
  const result = await renderApp()
  await screen.findByRole('heading', { name: 'Settings', level: 1 })
  await screen.findByRole('region', { name: 'Categories' })
  return result
}

const region = (name) => screen.getByRole('region', { name })
const row = (name) => within(region('Categories')).getByText(name, { selector: '.table__title' }).closest('tr')
// The logo link in the top bar; its name follows the company name ("Acme Ltd home")
const brand = () => screen.getByRole('link', { name: / home$/ })

describe('Settings: access', () => {
  it('an admin gets a "Settings" link in the nav, and it opens the page', async () => {
    mockSettings()
    const { user, router } = await renderApp(admin, '/tickets')
    await user.click(
      within(await screen.findByRole('navigation', { name: 'Main' })).getByRole('link', { name: 'Settings' }),
    )
    expect(await screen.findByRole('heading', { name: 'Settings', level: 1 })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/admin/settings')
  })

  it.each(['employee', 'agent', 'hr'])('%s gets no link and is sent away from /admin/settings', async (role) => {
    mockSettings()
    const { router } = await renderApp(buildUser({ role }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/tickets'))
    const nav = screen.getByRole('navigation', { name: 'Main' })
    expect(within(nav).queryByRole('link', { name: 'Settings' })).not.toBeInTheDocument()
  })
})

describe('Settings: company name', () => {
  it('shows the saved name; Save sends it, says "Saved", and the top bar changes at once', async () => {
    const state = mockSettings()
    const { user } = await renderSettings()
    const field = within(region('Company')).getByLabelText('Company name')
    expect(field).toHaveValue('Acme Ltd')
    await waitFor(() => expect(brand()).toHaveTextContent('Acme Ltd'))
    expect(within(region('Company')).getByRole('button', { name: 'Save' })).toBeDisabled() // nothing changed yet

    await user.clear(field)
    await user.type(field, '  Globex Corporation ')
    await user.click(within(region('Company')).getByRole('button', { name: 'Save' }))

    expect(await within(region('Company')).findByRole('status')).toHaveTextContent('Saved')
    expect(state.calls).toEqual([['PATCH', '/settings', { company_name: 'Globex Corporation' }]])
    expect(brand()).toHaveTextContent('Globex Corporation')
  })

  it('an empty name is refused before sending, under the field', async () => {
    const state = mockSettings()
    const { user } = await renderSettings()
    const field = within(region('Company')).getByLabelText('Company name')
    await user.clear(field)
    await user.type(field, '   ')
    await user.click(within(region('Company')).getByRole('button', { name: 'Save' }))
    expect(field).toHaveAccessibleDescription('Company name is required')
    expect(field).toHaveAttribute('aria-invalid', 'true')
    expect(state.calls).toEqual([])
  })

  it("the backend's field error shows under the field, other errors in an alert", async () => {
    mockSettings({
      fail: {
        saveSettings: {
          status: 400,
          body: {
            message: 'Invalid',
            errors: [{ field: 'company_name', message: 'Company name must be 1–100 characters' }],
          },
        },
      },
    })
    const { user } = await renderSettings()
    const field = within(region('Company')).getByLabelText('Company name')
    await user.type(field, ' X')
    await user.click(within(region('Company')).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(field).toHaveAccessibleDescription('Company name must be 1–100 characters'))
  })

  it('a failed save that is not about the field is shown as an alert', async () => {
    mockSettings({ fail: { saveSettings: { status: 500, body: { message: 'Something went wrong on the server' } } } })
    const { user } = await renderSettings()
    await user.type(within(region('Company')).getByLabelText('Company name'), ' X')
    await user.click(within(region('Company')).getByRole('button', { name: 'Save' }))
    expect(await within(region('Company')).findByRole('alert')).toHaveTextContent('Something went wrong on the server')
  })

  it('a failed load shows an error instead of the form', async () => {
    mockSettings({ fail: { settings: { status: 500, body: { message: 'Settings could not be loaded' } } } })
    await renderApp()
    expect(await within(await screen.findByRole('region', { name: 'Company' })).findByRole('alert')).toHaveTextContent(
      'Settings could not be loaded',
    )
  })
})

describe('company name in the top bar and on the login page', () => {
  it('every user sees it next to the logo', async () => {
    mockSettings({ companyName: 'Initech' })
    await renderApp(buildUser({ role: 'employee' }), '/tickets')
    await waitFor(() => expect(brand()).toHaveTextContent('Initech'))
  })

  it('"TicketFlow" when no name is set, or when the request fails', async () => {
    mockSettings({ companyName: '' })
    const { unmount } = await renderApp(buildUser(), '/tickets')
    await screen.findByRole('navigation', { name: 'Main' })
    expect(brand()).toHaveTextContent('TicketFlow')
    unmount()

    mockSettings({ fail: { public: true } })
    await renderApp(buildUser(), '/tickets')
    await screen.findByRole('navigation', { name: 'Main' })
    expect(brand()).toHaveTextContent('TicketFlow')
  })

  it('the login page shows it too (no login needed for /settings/public)', async () => {
    mockSettings({ companyName: 'Initech' })
    await renderWithProviders(<Login />, { route: '/login' })
    await waitFor(() => expect(screen.getAllByText('Initech').length).toBeGreaterThan(0))
  })
})

describe('Settings: categories', () => {
  it('lists every category with its description and status', async () => {
    mockSettings()
    await renderSettings()
    expect(row('Hardware')).toHaveTextContent('Laptops and printers')
    expect(within(row('Hardware')).getByText('Active')).toBeInTheDocument()
    expect(within(row('Software')).getByText('—')).toBeInTheDocument()
    expect(within(row('Old phones')).getByText('Archived')).toBeInTheDocument()
  })

  it('Add: name and description, sent cleaned up, and the new category appears sorted', async () => {
    const state = mockSettings()
    const { user } = await renderSettings()
    await user.click(within(region('Categories')).getByRole('button', { name: 'Add category' }))
    const dialog = screen.getByRole('dialog', { name: 'Add category' })
    await user.type(within(dialog).getByLabelText('Name'), '  Access   cards ')
    await user.type(within(dialog).getByLabelText(/Description/), 'Badges and door access')
    await user.click(within(dialog).getByRole('button', { name: 'Add category' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(state.calls).toEqual([
      ['POST', '/categories', { name: 'Access cards', description: 'Badges and door access' }],
    ])
    const names = [...region('Categories').querySelectorAll('tbody .table__title')].map((el) => el.textContent)
    expect(names).toEqual(['Access cards', 'Hardware', 'Old phones', 'Software'])
  })

  it('Add: a name is required; a taken name (409) shows under the field', async () => {
    const state = mockSettings()
    const { user } = await renderSettings()
    await user.click(within(region('Categories')).getByRole('button', { name: 'Add category' }))
    const dialog = screen.getByRole('dialog', { name: 'Add category' })
    await user.click(within(dialog).getByRole('button', { name: 'Add category' }))
    expect(within(dialog).getByLabelText('Name')).toHaveAccessibleDescription('Name is required')
    expect(state.calls).toEqual([])

    await user.type(within(dialog).getByLabelText('Name'), 'hardware')
    await user.click(within(dialog).getByRole('button', { name: 'Add category' }))
    await waitFor(() =>
      expect(within(dialog).getByLabelText('Name')).toHaveAccessibleDescription(
        'A category with this name already exists',
      ),
    )
  })

  it("Add: the backend's 400 field errors go under their fields", async () => {
    mockSettings({
      fail: {
        addCategory: {
          status: 400,
          body: { message: 'Invalid', errors: [{ field: 'description', message: 'Description is too long' }] },
        },
      },
    })
    const { user } = await renderSettings()
    await user.click(within(region('Categories')).getByRole('button', { name: 'Add category' }))
    const dialog = screen.getByRole('dialog', { name: 'Add category' })
    await user.type(within(dialog).getByLabelText('Name'), 'Phones')
    await user.click(within(dialog).getByRole('button', { name: 'Add category' }))
    await waitFor(() =>
      expect(within(dialog).getByLabelText(/Description/)).toHaveAccessibleDescription('Description is too long'),
    )
  })

  it('Edit: prefilled, sends only what changed', async () => {
    const state = mockSettings()
    const { user } = await renderSettings()
    await user.click(within(row('Software')).getByRole('button', { name: 'Edit Software' }))
    const dialog = screen.getByRole('dialog', { name: 'Edit Software' })
    expect(within(dialog).getByLabelText('Name')).toHaveValue('Software')
    expect(within(dialog).getByRole('button', { name: 'Save changes' })).toBeDisabled()
    await user.type(within(dialog).getByLabelText(/Description/), 'Apps and licences')
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(state.calls).toEqual([['PATCH', '/categories/2', { description: 'Apps and licences' }]])
    expect(row('Software')).toHaveTextContent('Apps and licences')
  })

  it('Archive and Restore switch the status', async () => {
    const state = mockSettings()
    const { user } = await renderSettings()
    await user.click(within(row('Software')).getByRole('button', { name: 'Archive Software' }))
    await waitFor(() => expect(within(row('Software')).getByText('Archived')).toBeInTheDocument())
    await user.click(within(row('Software')).getByRole('button', { name: 'Restore Software' }))
    await waitFor(() => expect(within(row('Software')).getByText('Active')).toBeInTheDocument())
    expect(state.calls).toEqual([
      ['PATCH', '/categories/2', { is_active: false }],
      ['PATCH', '/categories/2', { is_active: true }],
    ])
  })

  it('a failed Archive shows the error and keeps the status', async () => {
    mockSettings({ fail: { patchCategory: { status: 500, body: { message: 'Something went wrong on the server' } } } })
    const { user } = await renderSettings()
    await user.click(within(row('Software')).getByRole('button', { name: 'Archive Software' }))
    expect(await within(region('Categories')).findByRole('alert')).toHaveTextContent(
      'Something went wrong on the server',
    )
    expect(within(row('Software')).getByText('Active')).toBeInTheDocument()
  })

  it('Delete asks first, then removes an unused category', async () => {
    const state = mockSettings()
    const { user } = await renderSettings()
    await user.click(within(row('Software')).getByRole('button', { name: 'Delete Software' }))
    const dialog = screen.getByRole('alertdialog', { name: 'Delete category' })
    expect(dialog).toHaveTextContent("Delete Software? This can't be undone.")
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(state.calls).toEqual([])

    await user.click(within(row('Software')).getByRole('button', { name: 'Delete Software' }))
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(within(region('Categories')).queryByText('Software')).not.toBeInTheDocument())
    expect(state.calls).toEqual([['DELETE', '/categories/2']])
  })

  it('Delete is disabled, with the reason, for a category tickets use', async () => {
    mockSettings()
    await renderSettings()
    for (const name of ['Hardware', 'Old phones']) {
      const button = within(row(name)).getByRole('button', { name: `Delete ${name}` })
      expect(button).toBeDisabled()
      expect(button).toHaveAccessibleDescription('Tickets use this category, archive it instead')
      expect(button.parentElement).toHaveAttribute('title', 'Tickets use this category, archive it instead')
    }
  })

  it("a refused delete (409 CATEGORY_IN_USE) shows the backend's message and disables Delete for that category", async () => {
    mockSettings({
      fail: {
        deleteCategory: {
          status: 409,
          body: { message: 'Tickets use this category. Archive it instead.', code: 'CATEGORY_IN_USE' },
        },
      },
    })
    const { user } = await renderSettings()
    await user.click(within(row('Software')).getByRole('button', { name: 'Delete Software' }))
    const dialog = screen.getByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Tickets use this category. Archive it instead.')
    expect(within(dialog).getByRole('button', { name: 'Delete' })).toBeDisabled()
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(within(row('Software')).getByRole('button', { name: 'Delete Software' })).toBeDisabled()
  })
})

describe('Settings: priorities', () => {
  const hoursField = (name) => within(region('Priorities')).getByLabelText(`Target time (hours) for ${name}`)

  it('lists the 4 levels with their target time, e.g. "24 h (1 day)"', async () => {
    mockSettings()
    await renderSettings()
    expect(hoursField('Low')).toHaveValue(120)
    expect(hoursField('Low')).toHaveAccessibleDescription('120 h (5 days)')
    expect(hoursField('Medium')).toHaveAccessibleDescription('72 h (3 days)')
    expect(hoursField('High')).toHaveAccessibleDescription('24 h (1 day)')
    expect(hoursField('Critical')).toHaveAccessibleDescription('4 h')
  })

  it('Save per row sends the new hours and says "Saved"', async () => {
    const state = mockSettings()
    const { user } = await renderSettings()
    const high = hoursField('High')
    await user.clear(high)
    await user.type(high, '12')
    expect(high).toHaveAccessibleDescription('12 h')
    await user.click(within(region('Priorities')).getByRole('button', { name: 'Save High' }))

    expect(await within(high.closest('li')).findByRole('status')).toHaveTextContent('Saved')
    expect(state.calls).toEqual([['PATCH', '/priorities/3', { target_hours: 12 }]])
    // Only that row changed
    expect(within(region('Priorities')).getByRole('button', { name: 'Save Medium' })).toBeDisabled()
  })

  it.each(['0', '2161', '2.5'])('%s hours is refused before sending', async (value) => {
    const state = mockSettings()
    const { user } = await renderSettings()
    const high = hoursField('High')
    await user.clear(high)
    await user.type(high, value)
    await user.click(within(region('Priorities')).getByRole('button', { name: 'Save High' }))
    expect(high).toHaveAccessibleDescription('Enter a whole number of hours from 1 to 2160')
    expect(state.calls).toEqual([])
  })

  it("the backend's error for target_hours shows under the field", async () => {
    mockSettings({
      fail: {
        priority: {
          status: 400,
          body: { message: 'Invalid', errors: [{ field: 'target_hours', message: 'Target hours must be 1–2160' }] },
        },
      },
    })
    const { user } = await renderSettings()
    const high = hoursField('High')
    await user.clear(high)
    await user.type(high, '48')
    await user.click(within(region('Priorities')).getByRole('button', { name: 'Save High' }))
    await waitFor(() => expect(high).toHaveAccessibleDescription('Target hours must be 1–2160'))
  })
})

describe('archived categories elsewhere', () => {
  it('New ticket only offers active categories', async () => {
    mockSettings()
    await renderWithProviders(<NewTicket />, { route: '/tickets/new', user: buildUser() })
    const select = await screen.findByRole('combobox', { name: 'Category' })
    const names = [...select.options].map((o) => o.textContent)
    expect(names).toEqual(['Choose a category…', 'Hardware', 'Software'])
  })

  it('the ticket list filter still offers archived ones, marked as archived', async () => {
    mockSettings()
    await renderWithProviders(<TicketList />, {
      route: '/tickets',
      path: '/tickets',
      user: buildUser({ role: 'agent' }),
    })
    await screen.findByRole('option', { name: 'Old phones (archived)' })
  })

  it('an old ticket in an archived category still shows its category by name', async () => {
    mockSettings()
    server.use(
      http.get(`${API}/tickets/42`, () =>
        HttpResponse.json({
          ...buildTicket({ id: 42, title: 'Phone will not charge' }),
          category_id: 3,
          category_name: 'Old phones',
          status: 'open',
          resolution: null,
          resolved_at: null,
          target_hours: 72,
          comments: [],
          history: [],
          attachments: [],
        }),
      ),
    )
    await renderWithProviders(<TicketDetail />, { route: '/tickets/42', path: '/tickets/:id', user: buildUser() })
    expect(await screen.findByText('Old phones')).toBeInTheDocument()
  })
})
