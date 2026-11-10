// Profile.test.jsx – /profile shows your own details from GET /auth/me for every role, links to Change password,
// and is opened from your name in the top bar.
import { screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import Layout from '../components/Layout'
import ProtectedRoute from '../components/ProtectedRoute'
import { buildUser } from '../test/factories'
import { renderWithProviders } from '../test/render'
import { API, server, session } from '../test/server'
import Profile from './Profile'

// Mirrors App.jsx: /profile inside the login check and the Layout, with stubs for the pages it links to
const routes = [
  { path: '/login', element: <h1>Login page</h1> },
  {
    element: <ProtectedRoute />,
    children: [
      { path: '/change-password', element: <h1>Change password page</h1> },
      {
        element: <Layout />,
        children: [
          { path: '/profile', element: <Profile /> },
          { path: '/tickets', element: <h1>Tickets page</h1> },
          { path: '/set-password', element: <h1>Set password page</h1> },
        ],
      },
    ],
  },
]

async function renderProfile(user, route = '/profile') {
  return renderWithProviders(null, { route, routes, user })
}

// The value next to a label in the "My details" list
function detail(label) {
  const list = screen.getByRole('region', { name: 'My details' })
  return within(list).getByText(label, { selector: 'dt' }).nextElementSibling.textContent
}

async function waitForDetails() {
  return screen.findByRole('region', { name: 'My details' })
}

describe('Profile', () => {
  it.each([
    ['employee', 'Employee'],
    ['agent', 'IT Staff'],
    ['hr', 'HR'],
    ['admin', 'Admin'],
  ])('shows a %s their own details', async (role, label) => {
    await renderProfile(buildUser({ role, name: 'Drita Berisha', email: `${role}@ticketflow.local` }))

    await waitForDetails()
    expect(screen.getByRole('heading', { name: 'My profile' })).toBeInTheDocument()
    expect(detail('Name')).toBe('Drita Berisha')
    expect(detail('Email')).toBe(`${role}@ticketflow.local`)
    expect(detail('Role')).toBe(label)
    expect(detail('Department')).toBe('Finance')
    expect(screen.getByText('To change these, contact your HR or IT admin.')).toBeInTheDocument()
  })

  it('shows the department name, not its id', async () => {
    await renderProfile(buildUser({ department_id: 3, department_name: 'Sales' }))

    await waitForDetails()
    expect(detail('Department')).toBe('Sales')
    expect(screen.queryByText('3', { selector: 'dd' })).not.toBeInTheDocument()
  })

  it('shows the details GET /auth/me returns, not the ones saved at login', async () => {
    const saved = buildUser({ name: 'Old Name' })
    server.use(http.get(`${API}/auth/me`, () => HttpResponse.json({ ...saved, name: 'New Name' })))
    await renderProfile(saved)

    await waitForDetails()
    expect(detail('Name')).toBe('New Name')
  })

  it('shows "—" for empty fields', async () => {
    const me = buildUser({ department_id: null, department_name: null, job_title: null, last_login_at: null })
    server.use(http.get(`${API}/auth/me`, () => HttpResponse.json({ ...me, created_at: '2026-11-03T14:05:00Z' })))
    await renderProfile(me)

    await waitForDetails()
    expect(detail('Department')).toBe('—')
    expect(detail('Job title')).toBe('—')
    expect(detail('Last login')).toBe('—')
    expect(detail('Member since')).toBe('3 November 2026')
  })

  it('leaves out fields the API does not return', async () => {
    await renderProfile(buildUser())

    await waitForDetails()
    const list = screen.getByRole('region', { name: 'My details' })
    for (const label of ['Job title', 'Member since', 'Last login']) {
      expect(within(list).queryByText(label)).not.toBeInTheDocument()
    }
  })

  it('shows an error when the details cannot be loaded', async () => {
    // The startup session check succeeds; the page's own request for the details fails
    let calls = 0
    server.use(
      http.get(`${API}/auth/me`, () =>
        (calls += 1) === 1
          ? HttpResponse.json(session.user)
          : HttpResponse.json({ message: 'Server error' }, { status: 500 }),
      ),
    )
    await renderProfile(buildUser())

    expect(await screen.findByRole('alert')).toHaveTextContent('Server error')
  })

  it('opens the Change password page from the Password card', async () => {
    const { user, router } = await renderProfile(buildUser())

    await waitForDetails()
    const card = screen.getByRole('region', { name: 'Password' })
    expect(within(card).getByText('Change your password regularly to keep your account safe')).toBeInTheDocument()
    await user.click(within(card).getByRole('link', { name: 'Change password' }))

    expect(await screen.findByRole('heading', { name: 'Change password page' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/change-password')
    // So Cancel on that page comes back here
    expect(router.state.location.state.from.pathname).toBe('/profile')
  })

  it('opens from the name in the top bar', async () => {
    const { user, router } = await renderProfile(buildUser({ name: 'Vjosa Hoxha' }), '/tickets')

    await user.click(await screen.findByRole('link', { name: 'My profile (Vjosa Hoxha)' }))

    await waitForDetails()
    expect(router.state.location.pathname).toBe('/profile')
  })

  it('has no profile link while the user must set a password', async () => {
    await renderProfile(buildUser({ must_change_password: true }), '/set-password')

    expect(await screen.findByRole('heading', { name: 'Set password page' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /My profile/ })).not.toBeInTheDocument()
  })

  it('sends a logged-out visitor to the login page', async () => {
    const { router } = await renderProfile(null)

    expect(await screen.findByRole('heading', { name: 'Login page' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
  })
})
