// ProtectedRoute.test.jsx – logged-out users go to /login (and come back after signing in), roles are enforced.
import { act, screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { useLocation } from 'react-router-dom'
import client, { TOKEN_KEY, USER_KEY } from '../api/client'
import Login from '../pages/Login'
import { buildUser } from '../test/factories'
import { renderWithProviders, stubRoutes } from '../test/render'
import { API, server } from '../test/server'
import ProtectedRoute from './ProtectedRoute'

// Stand-in login page that shows which page the redirect says the user came from
function LoginWithOrigin() {
  const { state } = useLocation()
  return <p>Sign in to continue to {state?.from?.pathname}</p>
}


// Mirrors App.jsx: a protected layout route with an admin-only branch inside it
function appRoutes({ loginElement = <h1>Login page</h1> } = {}) {
  return [
    { path: '/login', element: loginElement },
    {
      element: <ProtectedRoute />,
      children: [
        ...stubRoutes.filter((r) => r.path !== '/login'),
        { path: '/set-password', element: <h1>Set password page</h1> },
        {
          element: <ProtectedRoute roles={['admin']} />,
          children: [{ path: '/admin', element: <h1>Admin dashboard</h1> }],
        },
      ],
    },
    {
      path: '/wrapped',
      element: (
        <ProtectedRoute>
          <h1>Wrapped page</h1>
        </ProtectedRoute>
      ),
    },
  ]
}

describe('ProtectedRoute', () => {
  it('sends a logged-out user to the login page', async () => {
    const { router } = renderWithProviders(null, { route: '/tickets', routes: appRoutes() })

    expect(await screen.findByRole('heading', { name: 'Login page' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Tickets page' })).not.toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
  })

  it('shows the page to a logged-in user', async () => {
    renderWithProviders(null, { route: '/tickets', routes: appRoutes(), user: buildUser() })

    expect(await screen.findByRole('heading', { name: 'Tickets page' })).toBeInTheDocument()
  })

  it('also works as a wrapper around a page', async () => {
    renderWithProviders(null, { route: '/wrapped', routes: appRoutes(), user: buildUser() })
    expect(await screen.findByRole('heading', { name: 'Wrapped page' })).toBeInTheDocument()
  })

  it('also redirects a logged-out user when used as a wrapper', async () => {
    renderWithProviders(null, { route: '/wrapped', routes: appRoutes() })
    expect(await screen.findByRole('heading', { name: 'Login page' })).toBeInTheDocument()
  })

  describe('roles', () => {
    it.each(['employee', 'agent', 'hr'])('sends a %s away from an admin-only page to /tickets', async (role) => {
      const { router } = renderWithProviders(null, { route: '/admin', routes: appRoutes(), user: buildUser({ role }) })

      expect(await screen.findByRole('heading', { name: 'Tickets page' })).toBeInTheDocument()
      expect(screen.queryByRole('heading', { name: 'Admin dashboard' })).not.toBeInTheDocument()
      expect(router.state.location.pathname).toBe('/tickets')
    })

    it('lets an admin open an admin-only page', async () => {
      renderWithProviders(null, { route: '/admin', routes: appRoutes(), user: buildUser({ role: 'admin' }) })

      expect(await screen.findByRole('heading', { name: 'Admin dashboard' })).toBeInTheDocument()
    })
  })

  describe('saved session', () => {
    // There is no async "auth loading" state: the saved session is read synchronously on the first render,
    // and GET /auth/me only refreshes it in the background. So the page must render straight away, never /login first.
    it('renders the page on the first render, without waiting for the profile refresh', () => {
      renderWithProviders(null, { route: '/tickets', routes: appRoutes(), user: buildUser() })

      expect(screen.getByRole('heading', { name: 'Tickets page' })).toBeInTheDocument()
    })

    it('logs the user out and redirects when the saved token has expired', async () => {
      server.use(http.get(`${API}/auth/me`, () => HttpResponse.json({ message: 'Session expired' }, { status: 401 })))
      renderWithProviders(null, { route: '/tickets', routes: appRoutes(), user: buildUser() })

      expect(screen.getByRole('heading', { name: 'Tickets page' })).toBeInTheDocument()
      expect(await screen.findByRole('heading', { name: 'Login page' })).toBeInTheDocument()
      expect(localStorage.getItem(TOKEN_KEY)).toBeNull()
    })

    it('treats a corrupted saved user as logged out', async () => {
      localStorage.setItem(TOKEN_KEY, 'test-token')
      localStorage.setItem(USER_KEY, '{not json')
      renderWithProviders(null, { route: '/tickets', routes: appRoutes() })

      expect(await screen.findByRole('heading', { name: 'Login page' })).toBeInTheDocument()
    })
  })

  describe('temporary password', () => {
    it('sends a user who must change their password to /set-password', async () => {
      const { router } = renderWithProviders(null, {
        route: '/tickets/42',
        routes: appRoutes(),
        user: buildUser({ must_change_password: true }),
      })

      expect(await screen.findByRole('heading', { name: 'Set password page' })).toBeInTheDocument()
      expect(router.state.location.pathname).toBe('/set-password')
    })

    it('also keeps them out of role-protected pages', async () => {
      const { router } = renderWithProviders(null, {
        route: '/admin',
        routes: appRoutes(),
        user: buildUser({ role: 'admin', must_change_password: true }),
      })

      expect(await screen.findByRole('heading', { name: 'Set password page' })).toBeInTheDocument()
      expect(router.state.location.pathname).toBe('/set-password')
    })

    it('redirects when the backend says the password was reset during the session', async () => {
      server.use(
        // The profile refresh on load fails (network), so only the 403 below can flag the user
        http.get(`${API}/auth/me`, () => HttpResponse.error()),
        http.get(`${API}/tickets`, () =>
          HttpResponse.json(
            { message: 'You must change your password before continuing', code: 'PASSWORD_CHANGE_REQUIRED' },
            { status: 403 },
          ),
        ),
      )
      renderWithProviders(null, { route: '/tickets', routes: appRoutes(), user: buildUser() })
      expect(screen.getByRole('heading', { name: 'Tickets page' })).toBeInTheDocument()

      // Any page's request; act() because the refusal updates the logged-in user
      await act(async () => {
        await expect(client.get('/tickets')).rejects.toThrow()
      })

      expect(await screen.findByRole('heading', { name: 'Set password page' })).toBeInTheDocument()
      expect(JSON.parse(localStorage.getItem(USER_KEY)).must_change_password).toBe(true)
      expect(localStorage.getItem(TOKEN_KEY)).toBe('test-token') // still logged in
    })
  })

  it('remembers the page the user asked for when redirecting to /login', async () => {
    renderWithProviders(null, { route: '/tickets/42', routes: appRoutes({ loginElement: <LoginWithOrigin /> }) })

    expect(await screen.findByText('Sign in to continue to /tickets/42')).toBeInTheDocument()
  })

  it('returns the user to the page they asked for after logging in', async () => {
    const employee = buildUser()
    server.use(http.post(`${API}/auth/login`, () => HttpResponse.json({ token: 'fresh-token', user: employee })))
    const { user, router } = renderWithProviders(null, {
      route: '/tickets/42',
      routes: appRoutes({ loginElement: <Login /> }),
    })

    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument()
    await user.type(screen.getByLabelText('Work email'), employee.email)
    await user.type(screen.getByLabelText('Password'), 'password123')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('heading', { name: 'Ticket 42' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/tickets/42')
  })
})
