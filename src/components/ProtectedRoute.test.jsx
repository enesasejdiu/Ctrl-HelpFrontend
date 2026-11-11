// ProtectedRoute.test.jsx – the session check on startup, logged-out users go to /login (and come back after signing
// in), a session ending mid-way, roles and temporary passwords.
import { act, screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { useLocation, useNavigate } from 'react-router'
import client from '../api/client'
import { CHECKING_SESSION_LABEL } from '../context/AuthContext'
import { useAuth } from '../context/auth'
import Login from '../pages/Login'
import { buildUser } from '../test/factories'
import { renderWithProviders, stubRoutes } from '../test/render'
import { API, deferred, server } from '../test/server'
import ProtectedRoute from './ProtectedRoute'

// Stand-in login page that shows which page the redirect says the user came from
function LoginWithOrigin() {
  const { state } = useLocation()
  return <p>Sign in to continue to {state?.from?.pathname}</p>
}

// A page with a Log out button that works like the one in Layout
function LogoutPage() {
  const { logout } = useAuth()
  const navigate = useNavigate()
  return (
    <button
      type="button"
      onClick={async () => {
        await logout()
        navigate('/login', { replace: true })
      }}
    >
      Log out
    </button>
  )
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
        { path: '/account', element: <LogoutPage /> },
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
    const { router } = await renderWithProviders(null, { route: '/tickets', routes: appRoutes() })

    expect(await screen.findByRole('heading', { name: 'Login page' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Tickets page' })).not.toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
  })

  it('shows the page to a logged-in user', async () => {
    await renderWithProviders(null, { route: '/tickets', routes: appRoutes(), user: buildUser() })

    expect(await screen.findByRole('heading', { name: 'Tickets page' })).toBeInTheDocument()
  })

  it('also works as a wrapper around a page', async () => {
    await renderWithProviders(null, { route: '/wrapped', routes: appRoutes(), user: buildUser() })
    expect(await screen.findByRole('heading', { name: 'Wrapped page' })).toBeInTheDocument()
  })

  it('also redirects a logged-out user when used as a wrapper', async () => {
    await renderWithProviders(null, { route: '/wrapped', routes: appRoutes() })
    expect(await screen.findByRole('heading', { name: 'Login page' })).toBeInTheDocument()
  })

  describe('roles', () => {
    it.each(['employee', 'agent', 'hr'])('sends a %s away from an admin-only page to /tickets', async (role) => {
      const { router } = await renderWithProviders(null, {
        route: '/admin',
        routes: appRoutes(),
        user: buildUser({ role }),
      })

      expect(await screen.findByRole('heading', { name: 'Tickets page' })).toBeInTheDocument()
      expect(screen.queryByRole('heading', { name: 'Admin dashboard' })).not.toBeInTheDocument()
      expect(router.state.location.pathname).toBe('/tickets')
    })

    it('lets an admin open an admin-only page', async () => {
      await renderWithProviders(null, { route: '/admin', routes: appRoutes(), user: buildUser({ role: 'admin' }) })

      expect(await screen.findByRole('heading', { name: 'Admin dashboard' })).toBeInTheDocument()
    })
  })

  describe('session check on startup', () => {
    // Whether someone is logged in comes from GET /auth/me (the httpOnly cookie), never from anything stored here
    it('shows a loading state, not /login, until the backend has answered', async () => {
      const pending = deferred()
      const me = buildUser()
      server.use(
        http.get(`${API}/auth/me`, async () => {
          await pending.promise
          return HttpResponse.json(me)
        }),
      )
      const { router } = await renderWithProviders(null, {
        route: '/tickets',
        routes: appRoutes(),
        waitForSession: false,
      })

      expect(screen.getByText(CHECKING_SESSION_LABEL)).toBeInTheDocument()
      expect(screen.queryByRole('heading', { name: 'Login page' })).not.toBeInTheDocument()
      expect(router.state.location.pathname).toBe('/tickets')

      pending.resolve()
      expect(await screen.findByRole('heading', { name: 'Tickets page' })).toBeInTheDocument()
      expect(screen.queryByText(CHECKING_SESSION_LABEL)).not.toBeInTheDocument()
    })

    it('/auth/me 200: logged in, the page renders', async () => {
      await renderWithProviders(null, { route: '/tickets', routes: appRoutes(), user: buildUser() })
      expect(screen.getByRole('heading', { name: 'Tickets page' })).toBeInTheDocument()
    })

    it('/auth/me 401: logged out, sent to /login with the page they asked for', async () => {
      server.use(http.get(`${API}/auth/me`, () => HttpResponse.json({ message: 'Not logged in' }, { status: 401 })))
      await renderWithProviders(null, {
        route: '/tickets/42',
        routes: appRoutes({ loginElement: <LoginWithOrigin /> }),
      })

      expect(await screen.findByText('Sign in to continue to /tickets/42')).toBeInTheDocument()
    })

    it('/auth/me 401 on a first visit is not a session expiring: no message', async () => {
      server.use(http.get(`${API}/auth/me`, () => HttpResponse.json({ message: 'Not logged in' }, { status: 401 })))
      const { router } = await renderWithProviders(null, {
        route: '/tickets/42',
        routes: appRoutes({ loginElement: <Login /> }),
      })

      expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument()
      expect(router.state.location.search).toBe('')
      expect(screen.queryByRole('status')).not.toBeInTheDocument()
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('/auth/me 401 for a logged-out visitor never calls POST /auth/logout', async () => {
      const logouts = []
      server.use(
        http.get(`${API}/auth/me`, () => HttpResponse.json({ message: 'Not logged in' }, { status: 401 })),
        http.post(`${API}/auth/logout`, () => {
          logouts.push(1)
          return new HttpResponse(null, { status: 204 })
        }),
      )
      await renderWithProviders(null, { route: '/tickets', routes: appRoutes({ loginElement: <Login /> }) })

      expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument()
      // Give any stray request a chance to go out before checking that none did (inside act: the sign-in page's
      // GET /auth/config answer arrives meanwhile)
      await act(() => new Promise((resolve) => setTimeout(resolve, 50)))
      expect(logouts).toHaveLength(0)
    })

    it('treats an unreachable server as logged out', async () => {
      server.use(http.get(`${API}/auth/me`, () => HttpResponse.error()))
      await renderWithProviders(null, { route: '/tickets', routes: appRoutes() })

      expect(await screen.findByRole('heading', { name: 'Login page' })).toBeInTheDocument()
    })

    it('removes a token left in localStorage by an older version, and does not use it', async () => {
      localStorage.setItem('ticketflow.token', 'old-token')
      localStorage.setItem('ticketflow.user', JSON.stringify(buildUser()))
      localStorage.setItem('unrelated', 'kept')
      const requests = []
      server.events.on('request:start', ({ request }) => requests.push(request))
      await renderWithProviders(null, { route: '/tickets', routes: appRoutes() })

      expect(await screen.findByRole('heading', { name: 'Login page' })).toBeInTheDocument()
      expect(localStorage.getItem('ticketflow.token')).toBeNull()
      expect(localStorage.getItem('ticketflow.user')).toBeNull()
      expect(localStorage.getItem('unrelated')).toBe('kept')
      expect(requests.every((request) => !request.headers.has('authorization'))).toBe(true)
    })
  })

  describe('session ending mid-way', () => {
    it('a 401 on any request drops the user and sends them to /login, remembering the page', async () => {
      server.use(http.get(`${API}/tickets`, () => HttpResponse.json({ message: 'Session expired' }, { status: 401 })))
      await renderWithProviders(null, {
        route: '/tickets/42',
        routes: appRoutes({ loginElement: <LoginWithOrigin /> }),
        user: buildUser(),
      })
      expect(screen.getByRole('heading', { name: 'Ticket 42' })).toBeInTheDocument()

      await act(async () => {
        await expect(client.get('/tickets')).rejects.toThrow()
      })

      expect(await screen.findByText('Sign in to continue to /tickets/42')).toBeInTheDocument()
    })

    it('the redirect says why (?reason=session_expired) and keeps the page to return to', async () => {
      server.use(http.get(`${API}/tickets`, () => HttpResponse.json({ message: 'Session expired' }, { status: 401 })))
      const { router } = await renderWithProviders(null, {
        route: '/tickets/42?tab=history',
        routes: appRoutes({ loginElement: <LoginWithOrigin /> }),
        user: buildUser(),
      })

      await act(async () => {
        await expect(client.get('/tickets')).rejects.toThrow()
      })

      await screen.findByText('Sign in to continue to /tickets/42')
      expect(router.state.location.pathname).toBe('/login')
      expect(router.state.location.search).toBe('?reason=session_expired')
      expect(router.state.location.state.from).toMatchObject({ pathname: '/tickets/42', search: '?tab=history' })
    })

    it('the real login page then says the session expired, once, and logging in returns to the page', async () => {
      server.use(
        http.get(`${API}/tickets`, () => HttpResponse.json({ message: 'Session expired' }, { status: 401 })),
        http.post(`${API}/auth/login`, () => HttpResponse.json({ user: buildUser() })),
      )
      const { user, router } = await renderWithProviders(null, {
        route: '/tickets/42',
        routes: appRoutes({ loginElement: <Login /> }),
        user: buildUser(),
      })

      await act(async () => {
        await expect(client.get('/tickets')).rejects.toThrow()
      })

      expect(await screen.findByRole('status')).toHaveTextContent('Your session has ended. Please sign in again.')
      await waitFor(() => expect(router.state.location.search).toBe(''))

      await user.type(screen.getByLabelText('Work email'), 'employee1@ticketflow.local')
      await user.type(screen.getByLabelText('Password'), 'password123')
      await user.click(screen.getByRole('button', { name: 'Sign in' }))

      expect(await screen.findByRole('heading', { name: 'Ticket 42' })).toBeInTheDocument()
    })

    it('a 403 CSRF_INVALID says the same, and signing in returns to the page', async () => {
      server.use(
        http.post(`${API}/tickets`, () =>
          HttpResponse.json(
            { message: 'Missing or invalid CSRF token. Reload the page and try again.', code: 'CSRF_INVALID' },
            { status: 403 },
          ),
        ),
        http.post(`${API}/auth/login`, () => HttpResponse.json({ user: buildUser() })),
      )
      const { user } = await renderWithProviders(null, {
        route: '/tickets/42',
        routes: appRoutes({ loginElement: <Login /> }),
        user: buildUser(),
      })

      await act(async () => {
        await expect(client.post('/tickets', {})).rejects.toThrow()
      })

      expect(await screen.findByRole('status')).toHaveTextContent('Your session has ended. Please sign in again.')
      await user.type(screen.getByLabelText('Work email'), 'employee1@ticketflow.local')
      await user.type(screen.getByLabelText('Password'), 'password123')
      await user.click(screen.getByRole('button', { name: 'Sign in' }))
      expect(await screen.findByRole('heading', { name: 'Ticket 42' })).toBeInTheDocument()
    })

    it('once shown, a later trip to /login does not repeat it', async () => {
      server.use(http.get(`${API}/tickets`, () => HttpResponse.json({ message: 'Session expired' }, { status: 401 })))
      const { router } = await renderWithProviders(null, {
        route: '/tickets/42',
        routes: appRoutes({ loginElement: <Login /> }),
        user: buildUser(),
      })
      await act(async () => {
        await expect(client.get('/tickets')).rejects.toThrow()
      })
      await screen.findByRole('status')
      await waitFor(() => expect(router.state.location.search).toBe(''))

      await act(() => router.navigate('/tickets'))

      await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
      expect(router.state.location.search).toBe('')
      expect(screen.queryByText(/session has ended/)).not.toBeInTheDocument()
    })

    it('logging out yourself is not a session expiring: plain /login, no message', async () => {
      const { user, router } = await renderWithProviders(null, {
        route: '/account',
        routes: appRoutes({ loginElement: <Login /> }),
        user: buildUser(),
      })

      await user.click(screen.getByRole('button', { name: 'Log out' }))

      expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument()
      expect(router.state.location.search).toBe('')
      expect(screen.queryByText(/session has ended/)).not.toBeInTheDocument()
    })

    it('a 401 that arrives while logging out does not count as a session expiring', async () => {
      const gate = deferred()
      server.use(
        http.post(`${API}/auth/logout`, async () => {
          await gate.promise
          return new HttpResponse(null, { status: 204 })
        }),
        http.get(`${API}/tickets`, () => HttpResponse.json({ message: 'Not logged in' }, { status: 401 })),
      )
      const { user, router } = await renderWithProviders(null, {
        route: '/account',
        routes: appRoutes({ loginElement: <Login /> }),
        user: buildUser(),
      })

      await user.click(screen.getByRole('button', { name: 'Log out' }))
      await act(async () => {
        await expect(client.get('/tickets')).rejects.toThrow()
      })
      gate.resolve()

      expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument()
      expect(router.state.location.search).toBe('')
      expect(screen.queryByText(/session has ended/)).not.toBeInTheDocument()
    })

    it('a 401 from the login request itself (wrong password) does not count as a session ending', async () => {
      const requests = []
      server.events.on('request:start', ({ request }) => requests.push(new URL(request.url).pathname))
      server.use(
        http.post(`${API}/auth/login`, () =>
          HttpResponse.json({ message: 'Wrong email or password' }, { status: 401 }),
        ),
      )
      const { user } = await renderWithProviders(null, {
        route: '/login',
        routes: appRoutes({ loginElement: <Login /> }),
      })

      await user.type(screen.getByLabelText('Work email'), 'someone@test.local')
      await user.type(screen.getByLabelText('Password'), 'wrong-password')
      await user.click(screen.getByRole('button', { name: 'Sign in' }))

      expect(await screen.findByRole('alert')).toHaveTextContent('Wrong email or password')
      // Only the startup check and the login: no retry loop of /auth/me (the sign-in page's GET /auth/config, for the
      // "Forgot password?" link, aside)
      expect(requests.filter((path) => path !== '/api/auth/config')).toEqual(['/api/auth/me', '/api/auth/login'])
    })
  })

  describe('temporary password', () => {
    it('sends a user who must change their password to /set-password', async () => {
      const { router } = await renderWithProviders(null, {
        route: '/tickets/42',
        routes: appRoutes(),
        user: buildUser({ must_change_password: true }),
      })

      expect(await screen.findByRole('heading', { name: 'Set password page' })).toBeInTheDocument()
      expect(router.state.location.pathname).toBe('/set-password')
    })

    it('also keeps them out of role-protected pages', async () => {
      const { router } = await renderWithProviders(null, {
        route: '/admin',
        routes: appRoutes(),
        user: buildUser({ role: 'admin', must_change_password: true }),
      })

      expect(await screen.findByRole('heading', { name: 'Set password page' })).toBeInTheDocument()
      expect(router.state.location.pathname).toBe('/set-password')
    })

    it('redirects when the backend says the password was reset during the session', async () => {
      server.use(
        http.get(`${API}/tickets`, () =>
          HttpResponse.json(
            { message: 'You must change your password before continuing', code: 'PASSWORD_CHANGE_REQUIRED' },
            { status: 403 },
          ),
        ),
      )
      await renderWithProviders(null, { route: '/tickets', routes: appRoutes(), user: buildUser() })
      expect(screen.getByRole('heading', { name: 'Tickets page' })).toBeInTheDocument()

      // Any page's request; act() because the refusal updates the logged-in user
      await act(async () => {
        await expect(client.get('/tickets')).rejects.toThrow()
      })

      expect(await screen.findByRole('heading', { name: 'Set password page' })).toBeInTheDocument()
      // Still logged in: the top-level redirect would otherwise have been to /login
      expect(screen.queryByRole('heading', { name: 'Login page' })).not.toBeInTheDocument()
    })
  })

  it('remembers the page the user asked for when redirecting to /login', async () => {
    await renderWithProviders(null, { route: '/tickets/42', routes: appRoutes({ loginElement: <LoginWithOrigin /> }) })

    expect(await screen.findByText('Sign in to continue to /tickets/42')).toBeInTheDocument()
  })

  it('returns the user to the page they asked for after logging in', async () => {
    const employee = buildUser()
    server.use(http.post(`${API}/auth/login`, () => HttpResponse.json({ must_change_password: false, user: employee })))
    const { user, router } = await renderWithProviders(null, {
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
