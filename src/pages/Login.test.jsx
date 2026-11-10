// Login.test.jsx – signing in: fields, success redirect, error messages and the pending state.
import { act, screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { buildUser } from '../test/factories'
import { renderReady } from '../test/render'
import { API, deferred, server } from '../test/server'
import Login from './Login'

// Records each login request body and answers with `respond(body)`
function mockLogin(respond) {
  const requests = []
  server.use(
    http.post(`${API}/auth/login`, async ({ request }) => {
      const body = await request.json()
      requests.push(body)
      return respond(body)
    }),
  )
  return requests
}

async function renderLogin(options) {
  return renderReady(<Login />, { route: '/login', ...options })
}

async function fillAndSubmit(user, email, password) {
  if (email) await user.type(screen.getByLabelText('Work email'), email)
  if (password) await user.type(screen.getByLabelText('Password'), password)
  await user.click(screen.getByRole('button', { name: 'Sign in' }))
}

describe('Login', () => {
  it('renders the email and password fields and a submit button', async () => {
    await renderLogin()

    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument()
    expect(screen.getByLabelText('Work email')).toHaveAttribute('type', 'email')
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled()
  })

  it('offers no sign-up: accounts are created by an admin or HR', async () => {
    await renderLogin()

    expect(screen.queryByRole('link', { name: /create an account|sign up|register/i })).not.toBeInTheDocument()
    expect(screen.getByText('No account yet? Ask your IT admin or HR to create one.')).toBeInTheDocument()
  })

  it('hides the password as it is typed', async () => {
    await renderLogin()
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password')
  })

  it('logs in with the entered credentials and goes to the ticket list, storing nothing in localStorage', async () => {
    const account = buildUser({ email: 'agent1@ticketflow.local', role: 'agent' })
    const requests = mockLogin(() => HttpResponse.json({ token: 'jwt-123', user: account }))
    const { user, router } = await renderLogin()

    await fillAndSubmit(user, 'agent1@ticketflow.local', 'password123')

    expect(await screen.findByRole('heading', { name: 'Tickets page' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/tickets')
    expect(requests).toEqual([{ email: 'agent1@ticketflow.local', password: 'password123' }])
    // The session is the backend's httpOnly cookie: the token in the response is ignored, and nothing is saved
    expect(localStorage.length).toBe(0)
  })

  it('goes back to the page the user came from after logging in', async () => {
    mockLogin(() => HttpResponse.json({ token: 'jwt-123', user: buildUser() }))
    const { user, router } = await renderLogin({
      route: { pathname: '/login', state: { from: { pathname: '/tickets/7' } } },
    })

    await fillAndSubmit(user, 'employee1@ticketflow.local', 'password123')

    expect(await screen.findByRole('heading', { name: 'Ticket 7' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/tickets/7')
  })

  it('keeps the filters of the page the user came from', async () => {
    mockLogin(() => HttpResponse.json({ token: 'jwt-123', user: buildUser() }))
    const { user, router } = await renderLogin({
      route: { pathname: '/login', state: { from: { pathname: '/tickets', search: '?status=open' } } },
    })

    await fillAndSubmit(user, 'employee1@ticketflow.local', 'password123')

    expect(await screen.findByRole('heading', { name: 'Tickets page' })).toBeInTheDocument()
    expect(router.state.location.search).toBe('?status=open')
  })

  it('shows the error and stays on the page when the credentials are wrong', async () => {
    mockLogin(() => HttpResponse.json({ message: 'Wrong email or password' }, { status: 401 }))
    const { user, router } = await renderLogin()

    await fillAndSubmit(user, 'employee1@ticketflow.local', 'not-my-password')

    expect(await screen.findByRole('alert')).toHaveTextContent('Wrong email or password')
    expect(router.state.location.pathname).toBe('/login')
    expect(screen.getByLabelText('Work email')).toHaveValue('employee1@ticketflow.local')
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled()
    expect(localStorage.length).toBe(0)
  })

  it('tells the user when the server cannot be reached', async () => {
    server.use(http.post(`${API}/auth/login`, () => HttpResponse.error()))
    const { user } = await renderLogin()

    await fillAndSubmit(user, 'employee1@ticketflow.local', 'password123')

    expect(await screen.findByRole('alert')).toHaveTextContent('Cannot reach the server')
  })

  describe('validation (before calling the API)', () => {
    it.each([
      ['an empty form', '', '', 'Email is required', 'Work email'],
      ['an invalid email', 'not-an-email', 'password123', 'Enter a valid email', 'Work email'],
      ['a missing password', 'employee1@ticketflow.local', '', 'Password is required', 'Password'],
    ])('rejects %s', async (_case, email, password, message, invalidLabel) => {
      const requests = mockLogin(() => HttpResponse.json({ token: 'jwt-123', user: buildUser() }))
      const { user } = await renderLogin()

      await fillAndSubmit(user, email, password)

      expect(screen.getByRole('alert')).toHaveTextContent(message)
      expect(screen.getByLabelText(invalidLabel)).toHaveAttribute('aria-invalid', 'true')
      expect(screen.getByLabelText(invalidLabel)).toHaveFocus()
      expect(requests).toHaveLength(0)
    })

    it('clears the error once the form is valid and sends a trimmed email', async () => {
      const requests = mockLogin(() => HttpResponse.json({ token: 'jwt-123', user: buildUser() }))
      const { user } = await renderLogin()

      await fillAndSubmit(user, 'oops', 'password123')
      expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid email')

      await user.clear(screen.getByLabelText('Work email'))
      await fillAndSubmit(user, '  employee1@ticketflow.local ')

      expect(await screen.findByRole('heading', { name: 'Tickets page' })).toBeInTheDocument()
      expect(requests).toEqual([{ email: 'employee1@ticketflow.local', password: 'password123' }])
    })

    it('still shows the API’s message when the server rejects the input', async () => {
      mockLogin(() => HttpResponse.json({ message: 'Email must be at most 150 characters' }, { status: 400 }))
      const { user } = await renderLogin()

      await fillAndSubmit(user, 'employee1@ticketflow.local', 'password123')

      expect(await screen.findByRole('alert')).toHaveTextContent('Email must be at most 150 characters')
    })
  })

  it('disables the button and shows progress while signing in', async () => {
    const gate = deferred()
    mockLogin(async () => {
      await gate.promise
      return HttpResponse.json({ token: 'jwt-123', user: buildUser() })
    })
    const { user } = await renderLogin()

    await fillAndSubmit(user, 'employee1@ticketflow.local', 'password123')

    expect(await screen.findByRole('button', { name: 'Signing in…' })).toBeDisabled()

    gate.resolve()
    expect(await screen.findByRole('heading', { name: 'Tickets page' })).toBeInTheDocument()
  })

  it('sends an already logged-in user to the ticket list', async () => {
    await renderLogin({ user: buildUser() })
    expect(await screen.findByRole('heading', { name: 'Tickets page' })).toBeInTheDocument()
  })

  it('fills in a demo account with one click', async () => {
    const { user } = await renderLogin()

    await user.click(screen.getByRole('button', { name: 'Admin' }))

    expect(screen.getByLabelText('Work email')).toHaveValue('admin@ticketflow.local')
    expect(screen.getByLabelText('Password')).toHaveValue('password123')
  })

  // The backend's login limits (backend README, "Login limits"): 423 ACCOUNT_LOCKED and 429 RATE_LIMITED
  describe('login limits', () => {
    const locked = (minutes) =>
      HttpResponse.json(
        { message: `Too many wrong passwords. Try again in ${minutes} minutes.`, code: 'ACCOUNT_LOCKED', retryAfterMinutes: minutes },
        { status: 423 },
      )

    afterEach(() => {
      vi.useRealTimers()
    })

    it('423: says the account is locked for N minutes, and disables the button with a countdown', async () => {
      const requests = mockLogin(() => locked(15))
      const { user } = await renderLogin()

      await fillAndSubmit(user, 'employee1@ticketflow.local', 'password123')

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Too many wrong passwords. Your account is locked for 15 minutes.',
      )
      const button = screen.getByRole('button', { name: /Try again in 1[45]:\d\d/ })
      expect(button).toBeDisabled()
      // Enter in the form doesn't send either
      await user.type(screen.getByLabelText('Password'), '{Enter}')
      expect(requests).toHaveLength(1)
    })

    it('423 with 1 minute left says "1 minute"', async () => {
      mockLogin(() => locked(1))
      const { user } = await renderLogin()

      await fillAndSubmit(user, 'employee1@ticketflow.local', 'password123')

      expect(await screen.findByRole('alert')).toHaveTextContent(
        /^Too many wrong passwords\. Your account is locked for 1 minute\.$/,
      )
    })

    it('counts down, and gives the button back when the lock runs out', async () => {
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
      mockLogin(() => locked(1))
      const { user } = await renderLogin()

      await fillAndSubmit(user, 'employee1@ticketflow.local', 'password123')
      expect(await screen.findByRole('button', { name: 'Try again in 1:00' })).toBeDisabled()

      act(() => vi.advanceTimersByTime(30_000))
      expect(screen.getByRole('button', { name: 'Try again in 0:30' })).toBeDisabled()

      act(() => vi.advanceTimersByTime(30_000))
      expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled()
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('the lock belongs to that account: another email can still sign in', async () => {
      mockLogin(() => locked(15))
      const { user } = await renderLogin()

      await fillAndSubmit(user, 'employee1@ticketflow.local', 'password123')
      await screen.findByRole('button', { name: /Try again in/ })

      const emailField = screen.getByLabelText('Work email')
      await user.clear(emailField)
      await user.type(emailField, 'employee2@ticketflow.local')
      expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled()
      // Back to the locked email (any letter case): disabled again
      await user.clear(emailField)
      await user.type(emailField, 'Employee1@ticketflow.local')
      expect(screen.getByRole('button', { name: /Try again in/ })).toBeDisabled()
    })

    it('429: asks to wait a few minutes, and keeps the button enabled', async () => {
      mockLogin(() =>
        HttpResponse.json(
          { message: 'Too many login attempts. Wait a few minutes and try again.', code: 'RATE_LIMITED' },
          { status: 429 },
        ),
      )
      const { user } = await renderLogin()

      await fillAndSubmit(user, 'employee1@ticketflow.local', 'password123')

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Too many login attempts. Wait a few minutes and try again.',
      )
      expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled()
    })

    it('401 still says "Wrong email or password"', async () => {
      mockLogin(() => HttpResponse.json({ message: 'Wrong email or password' }, { status: 401 }))
      const { user } = await renderLogin()

      await fillAndSubmit(user, 'employee1@ticketflow.local', 'wrong-password1')

      expect(await screen.findByRole('alert')).toHaveTextContent(/^Wrong email or password$/)
      expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled()
    })
  })
})
