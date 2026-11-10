// Login.test.jsx – signing in: fields, success redirect (only to pages on this site), the notices above the form
// (session expired, wrong credentials, server unreachable, account locked, rate limited) and the pending state.
import { act, screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { buildUser } from '../test/factories'
import { renderWithProviders } from '../test/render'
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
  return renderWithProviders(<Login />, { route: '/login', ...options })
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

  it('logs in with the entered credentials and goes to the ticket list, storing nothing', async () => {
    const account = buildUser({ email: 'agent1@ticketflow.local', role: 'agent' })
    const requests = mockLogin(() => HttpResponse.json({ token: 'jwt-123', user: account }))
    const { user, router } = await renderLogin()

    await fillAndSubmit(user, 'agent1@ticketflow.local', 'password123')

    expect(await screen.findByRole('heading', { name: 'Tickets page' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/tickets')
    expect(requests).toEqual([{ email: 'agent1@ticketflow.local', password: 'password123' }])
    // The session is the cookie the backend set; the token in the body is ignored and nothing is saved
    expect(localStorage.length).toBe(0)
    expect(sessionStorage.length).toBe(0)
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

  describe('return address after logging in', () => {
    it.each([
      ['another site', 'https://evil.example', '/x'],
      ['a protocol-relative address', '//evil.example', '/x'],
      ['a backslash trick', '/\\evil.example', ''],
      ['the login page itself', '/login', ''],
    ])('ignores %s and goes to the ticket list', async (_case, pathname, search) => {
      mockLogin(() => HttpResponse.json({ user: buildUser() }))
      const { user, router } = await renderLogin({
        route: { pathname: '/login', state: { from: { pathname, search } } },
      })

      await fillAndSubmit(user, 'employee1@ticketflow.local', 'password123')

      expect(await screen.findByRole('heading', { name: 'Tickets page' })).toBeInTheDocument()
      expect(router.state.location.pathname).toBe('/tickets')
    })
  })

  describe('messages', () => {
    it('wrong credentials: one generic message, never whether the email exists', async () => {
      mockLogin(() => HttpResponse.json({ message: 'Wrong email or password' }, { status: 401 }))
      const { user, router } = await renderLogin()

      await fillAndSubmit(user, 'employee1@ticketflow.local', 'not-my-password')

      expect(await screen.findByRole('alert')).toHaveTextContent(/^Wrong email or password$/)
      expect(router.state.location.pathname).toBe('/login')
      expect(screen.getByLabelText('Work email')).toHaveValue('employee1@ticketflow.local')
      expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled()
    })

    it.each([
      ['the server cannot be reached', () => HttpResponse.error()],
      ['the server fails', () => HttpResponse.json({ message: 'Database is down' }, { status: 500 })],
      ['the proxy cannot reach the backend', () => new HttpResponse(null, { status: 502 })],
    ])('%s: asks to try again', async (_case, respond) => {
      server.use(http.post(`${API}/auth/login`, respond))
      const { user } = await renderLogin()

      await fillAndSubmit(user, 'employee1@ticketflow.local', 'password123')

      expect(await screen.findByRole('alert')).toHaveTextContent(/^Couldn't reach the server\. Please try again\.$/)
      expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled()
    })

    it('shows one message at a time: the latest one', async () => {
      let attempt = 0
      mockLogin(() => {
        attempt += 1
        return attempt === 1
          ? HttpResponse.error()
          : HttpResponse.json({ message: 'Wrong email or password' }, { status: 401 })
      })
      const { user } = await renderLogin()

      await fillAndSubmit(user, 'employee1@ticketflow.local', 'password123')
      expect(await screen.findByText(/Couldn't reach the server/)).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Sign in' }))

      expect(await screen.findByText('Wrong email or password')).toBeInTheDocument()
      expect(screen.getAllByRole('alert')).toHaveLength(1)
      expect(screen.queryByText(/Couldn't reach the server/)).not.toBeInTheDocument()
    })
  })

  describe('session expired (?reason=session_expired)', () => {
    it('says the session expired, as a status (not an error), and takes the reason out of the URL', async () => {
      const { router } = await renderLogin({
        route: { pathname: '/login', search: '?reason=session_expired', state: { from: { pathname: '/tickets/42' } } },
      })

      const notice = screen.getByRole('status')
      expect(notice).toHaveTextContent('Your session has ended. Please sign in again.')
      expect(notice).toHaveClass('alert--info')
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      // Gone from the URL, so a reload or bookmark doesn't show it again; the page to return to is kept
      await waitFor(() => expect(router.state.location.search).toBe(''))
      expect(router.state.location.state).toEqual({ from: { pathname: '/tickets/42' } })
      expect(router.state.historyAction).toBe('REPLACE')
    })

    it('keeps other query parameters', async () => {
      const { router } = await renderLogin({ route: '/login?reason=session_expired&lang=en' })
      expect(screen.getByRole('status')).toHaveTextContent('Your session has ended.')
      await waitFor(() => expect(router.state.location.search).toBe('?lang=en'))
    })

    it('a reload (the same URL without the reason) shows nothing', async () => {
      const first = await renderLogin({ route: '/login?reason=session_expired' })
      await waitFor(() => expect(first.router.state.location.search).toBe(''))
      const reloadedUrl = `${first.router.state.location.pathname}${first.router.state.location.search}`
      first.unmount()

      await renderLogin({ route: reloadedUrl })
      expect(screen.queryByText(/session has ended/)).not.toBeInTheDocument()
    })

    it.each(['', '?reason=unknown', '?reason=%3Cimg%20src%3Dx%3E', '?reason=constructor', '?reason=toString'])(
      'shows nothing for %j (only known reasons, never the raw text)',
      async (search) => {
        const { container } = await renderLogin({ route: `/login${search}` })

        expect(screen.queryByRole('status')).not.toBeInTheDocument()
        expect(screen.queryByRole('alert')).not.toBeInTheDocument()
        expect(container.querySelector('img')).toBeNull()
      },
    )

    it('goes away when the form is submitted', async () => {
      mockLogin(() => HttpResponse.json({ message: 'Wrong email or password' }, { status: 401 }))
      const { user } = await renderLogin({ route: '/login?reason=session_expired' })
      expect(screen.getByRole('status')).toBeInTheDocument()

      await fillAndSubmit(user, 'employee1@ticketflow.local', 'password123')

      expect(await screen.findByRole('alert')).toHaveTextContent('Wrong email or password')
      expect(screen.queryByText(/session has ended/)).not.toBeInTheDocument()
    })

    it('after logging in, goes back to the page the user was on', async () => {
      mockLogin(() => HttpResponse.json({ user: buildUser() }))
      const { user, router } = await renderLogin({
        route: { pathname: '/login', search: '?reason=session_expired', state: { from: { pathname: '/tickets/42' } } },
      })

      await fillAndSubmit(user, 'employee1@ticketflow.local', 'password123')

      expect(await screen.findByRole('heading', { name: 'Ticket 42' })).toBeInTheDocument()
      expect(router.state.location.pathname).toBe('/tickets/42')
    })
  })

  // The backend's login limits: 423 ACCOUNT_LOCKED (Retry-After seconds, body retryAfterMinutes) and 429 RATE_LIMITED
  // (Retry-After seconds)
  describe('login limits', () => {
    const locked = ({ minutes = 15, retryAfter = minutes * 60 } = {}) =>
      HttpResponse.json(
        {
          message: `Too many wrong passwords. Try again in ${minutes} minutes.`,
          code: 'ACCOUNT_LOCKED',
          retryAfterMinutes: minutes,
        },
        { status: 423, headers: retryAfter ? { 'Retry-After': String(retryAfter) } : {} },
      )
    const rateLimited = (retryAfter) =>
      HttpResponse.json(
        { message: 'Too many login attempts. Wait a few minutes and try again.', code: 'RATE_LIMITED' },
        { status: 429, headers: retryAfter ? { 'Retry-After': String(retryAfter) } : {} },
      )
    // Intervals and the clock are fake; userEvent's own timeouts stay real
    const fakeClock = () => vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('423: says the account is locked, for how long, that Admin/HR can help, and disables the button', async () => {
      const requests = mockLogin(() => locked({ minutes: 15 }))
      const { user } = await renderLogin()

      await fillAndSubmit(user, 'employee1@ticketflow.local', 'password123')

      const alert = await screen.findByRole('alert')
      expect(alert).toHaveTextContent(
        'Too many failed attempts. Your account is locked. Try again in about 15 minutes.',
      )
      expect(alert).toHaveTextContent('An administrator or HR can reset your password.')
      expect(alert).toHaveClass('alert--warning')
      expect(within(alert).getByRole('timer')).toHaveTextContent('about 15 minutes')
      expect(screen.getByRole('button', { name: 'Try again in about 15 minutes' })).toBeDisabled()
      // Enter in the form doesn't send either
      await user.type(screen.getByLabelText('Password'), '{Enter}')
      expect(requests).toHaveLength(1)
    })

    it('counts down by the second (mm:ss) in the last 5 minutes, and gives the button back at zero', async () => {
      fakeClock()
      mockLogin(() => locked({ minutes: 2, retryAfter: 90 }))
      const { user } = await renderLogin()

      await fillAndSubmit(user, 'employee1@ticketflow.local', 'password123')
      expect(await screen.findByRole('timer')).toHaveTextContent('1:30')
      expect(screen.getByRole('button', { name: 'Try again in 1:30' })).toBeDisabled()

      act(() => vi.advanceTimersByTime(60_000))
      expect(screen.getByRole('timer')).toHaveTextContent('0:30')
      expect(screen.getByRole('button', { name: 'Try again in 0:30' })).toBeDisabled()

      act(() => vi.advanceTimersByTime(30_000))
      expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled()
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      expect(screen.getByRole('status')).toHaveTextContent('The lock has ended. You can try signing in again.')
    })

    it('goes from "about N minutes" to mm:ss', async () => {
      fakeClock()
      mockLogin(() => locked({ minutes: 6, retryAfter: 360 }))
      const { user } = await renderLogin()

      await fillAndSubmit(user, 'employee1@ticketflow.local', 'password123')
      expect(await screen.findByRole('timer')).toHaveTextContent('about 6 minutes')

      // 5:01 left is still over 5 minutes
      act(() => vi.advanceTimersByTime(59_000))
      expect(screen.getByRole('timer')).toHaveTextContent('about 6 minutes')
      act(() => vi.advanceTimersByTime(1_000))
      expect(screen.getByRole('timer')).toHaveTextContent('5:00')
      act(() => vi.advanceTimersByTime(1_000))
      expect(screen.getByRole('timer')).toHaveTextContent('4:59')
    })

    it('counts from an end time, so it is right after the tab was in the background', async () => {
      fakeClock()
      mockLogin(() => locked({ minutes: 2, retryAfter: 120 }))
      const { user } = await renderLogin()
      await fillAndSubmit(user, 'employee1@ticketflow.local', 'password123')
      expect(await screen.findByRole('timer')).toHaveTextContent('2:00')

      // A background tab: the clock moves on but the interval doesn't fire
      vi.setSystemTime(Date.now() + 100_000)
      act(() => document.dispatchEvent(new Event('visibilitychange')))

      expect(screen.getByRole('timer')).toHaveTextContent('0:20')
    })

    it('uses the minutes in the body when Retry-After is missing', async () => {
      mockLogin(() => locked({ minutes: 3, retryAfter: null }))
      const { user } = await renderLogin()

      await fillAndSubmit(user, 'employee1@ticketflow.local', 'password123')

      expect(await screen.findByRole('timer')).toHaveTextContent('3:00')
    })

    it('423 without any time: the fallback message, and the button stays usable', async () => {
      mockLogin(() => HttpResponse.json({ message: 'Locked', code: 'ACCOUNT_LOCKED' }, { status: 423 }))
      const { user } = await renderLogin()

      await fillAndSubmit(user, 'employee1@ticketflow.local', 'password123')

      const alert = await screen.findByRole('alert')
      expect(alert).toHaveTextContent(
        'Your account is temporarily locked. Try again later or contact your administrator or HR.',
      )
      expect(within(alert).queryByRole('timer')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled()
    })

    it('the lock belongs to that account: changing the email hides it and gives the button back', async () => {
      mockLogin(() => locked({ minutes: 15 }))
      const { user } = await renderLogin()

      await fillAndSubmit(user, 'employee1@ticketflow.local', 'password123')
      await screen.findByRole('button', { name: /Try again in/ })

      // Only a different address counts: the same one with other spacing or letter case is still locked
      const emailField = screen.getByLabelText('Work email')
      await user.type(emailField, ' ')
      expect(screen.getByRole('button', { name: /Try again in/ })).toBeDisabled()

      await user.clear(emailField)
      expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled()
      await user.type(emailField, 'employee2@ticketflow.local')
      expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled()
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('429 with Retry-After: says how long to wait, and disables the button until then (for any email)', async () => {
      fakeClock()
      mockLogin(() => rateLimited(45))
      const { user } = await renderLogin()

      await fillAndSubmit(user, 'employee1@ticketflow.local', 'password123')

      expect(await screen.findByRole('alert')).toHaveTextContent('Too many attempts. Please wait 0:45 and try again.')
      expect(screen.getByRole('button', { name: 'Try again in 0:45' })).toBeDisabled()
      // A rate limit is per address, not per account
      await user.type(screen.getByLabelText('Work email'), 'x')
      expect(screen.getByRole('button', { name: /Try again in/ })).toBeDisabled()

      act(() => vi.advanceTimersByTime(45_000))
      expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled()
      expect(screen.getByRole('status')).toHaveTextContent('You can try signing in again now.')
    })

    it('429 without Retry-After: asks to wait a few minutes, and keeps the button enabled', async () => {
      mockLogin(() => rateLimited(null))
      const { user } = await renderLogin()

      await fillAndSubmit(user, 'employee1@ticketflow.local', 'password123')

      expect(await screen.findByRole('alert')).toHaveTextContent(
        /^Too many attempts\. Please wait a few minutes and try again\.$/,
      )
      expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled()
    })

    it('stops its timer when the page goes away', async () => {
      fakeClock()
      mockLogin(() => locked({ minutes: 1, retryAfter: 60 }))
      const { user, unmount } = await renderLogin()
      await fillAndSubmit(user, 'employee1@ticketflow.local', 'password123')
      await screen.findByRole('timer')
      expect(vi.getTimerCount()).toBeGreaterThan(0)

      unmount()

      expect(vi.getTimerCount()).toBe(0)
    })
  })
})
