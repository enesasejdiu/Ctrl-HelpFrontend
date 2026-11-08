// Login.test.jsx – signing in: fields, success redirect, error messages and the pending state.
import { screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { TOKEN_KEY, USER_KEY } from '../api/client'
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

function renderLogin(options) {
  return renderWithProviders(<Login />, { route: '/login', ...options })
}

async function fillAndSubmit(user, email, password) {
  if (email) await user.type(screen.getByLabelText('Work email'), email)
  if (password) await user.type(screen.getByLabelText('Password'), password)
  await user.click(screen.getByRole('button', { name: 'Sign in' }))
}

describe('Login', () => {
  it('renders the email and password fields and a submit button', () => {
    renderLogin()

    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument()
    expect(screen.getByLabelText('Work email')).toHaveAttribute('type', 'email')
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled()
  })

  it('offers no sign-up: accounts are created by an admin or HR', () => {
    renderLogin()

    expect(screen.queryByRole('link', { name: /create an account|sign up|register/i })).not.toBeInTheDocument()
    expect(screen.getByText('No account yet? Ask your IT admin or HR to create one.')).toBeInTheDocument()
  })

  it('hides the password as it is typed', () => {
    renderLogin()
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password')
  })

  it('logs in with the entered credentials, saves the session and goes to the ticket list', async () => {
    const account = buildUser({ email: 'agent1@ticketflow.local', role: 'agent' })
    const requests = mockLogin(() => HttpResponse.json({ token: 'jwt-123', user: account }))
    const { user, router } = renderLogin()

    await fillAndSubmit(user, 'agent1@ticketflow.local', 'password123')

    expect(await screen.findByRole('heading', { name: 'Tickets page' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/tickets')
    expect(requests).toEqual([{ email: 'agent1@ticketflow.local', password: 'password123' }])
    expect(localStorage.getItem(TOKEN_KEY)).toBe('jwt-123')
    expect(JSON.parse(localStorage.getItem(USER_KEY))).toEqual(account)
  })

  it('goes back to the page the user came from after logging in', async () => {
    mockLogin(() => HttpResponse.json({ token: 'jwt-123', user: buildUser() }))
    const { user, router } = renderLogin({
      route: { pathname: '/login', state: { from: { pathname: '/tickets/7' } } },
    })

    await fillAndSubmit(user, 'employee1@ticketflow.local', 'password123')

    expect(await screen.findByRole('heading', { name: 'Ticket 7' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/tickets/7')
  })

  it('keeps the filters of the page the user came from', async () => {
    mockLogin(() => HttpResponse.json({ token: 'jwt-123', user: buildUser() }))
    const { user, router } = renderLogin({
      route: { pathname: '/login', state: { from: { pathname: '/tickets', search: '?status=open' } } },
    })

    await fillAndSubmit(user, 'employee1@ticketflow.local', 'password123')

    expect(await screen.findByRole('heading', { name: 'Tickets page' })).toBeInTheDocument()
    expect(router.state.location.search).toBe('?status=open')
  })

  it('shows the error and stays on the page when the credentials are wrong', async () => {
    mockLogin(() => HttpResponse.json({ message: 'Wrong email or password' }, { status: 401 }))
    const { user, router } = renderLogin()

    await fillAndSubmit(user, 'employee1@ticketflow.local', 'not-my-password')

    expect(await screen.findByRole('alert')).toHaveTextContent('Wrong email or password')
    expect(router.state.location.pathname).toBe('/login')
    expect(screen.getByLabelText('Work email')).toHaveValue('employee1@ticketflow.local')
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled()
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull()
  })

  it('tells the user when the server cannot be reached', async () => {
    server.use(http.post(`${API}/auth/login`, () => HttpResponse.error()))
    const { user } = renderLogin()

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
      const { user } = renderLogin()

      await fillAndSubmit(user, email, password)

      expect(screen.getByRole('alert')).toHaveTextContent(message)
      expect(screen.getByLabelText(invalidLabel)).toHaveAttribute('aria-invalid', 'true')
      expect(screen.getByLabelText(invalidLabel)).toHaveFocus()
      expect(requests).toHaveLength(0)
    })

    it('clears the error once the form is valid and sends a trimmed email', async () => {
      const requests = mockLogin(() => HttpResponse.json({ token: 'jwt-123', user: buildUser() }))
      const { user } = renderLogin()

      await fillAndSubmit(user, 'oops', 'password123')
      expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid email')

      await user.clear(screen.getByLabelText('Work email'))
      await fillAndSubmit(user, '  employee1@ticketflow.local ')

      expect(await screen.findByRole('heading', { name: 'Tickets page' })).toBeInTheDocument()
      expect(requests).toEqual([{ email: 'employee1@ticketflow.local', password: 'password123' }])
    })

    it('still shows the API’s message when the server rejects the input', async () => {
      mockLogin(() => HttpResponse.json({ message: 'Email must be at most 150 characters' }, { status: 400 }))
      const { user } = renderLogin()

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
    const { user } = renderLogin()

    await fillAndSubmit(user, 'employee1@ticketflow.local', 'password123')

    expect(await screen.findByRole('button', { name: 'Signing in…' })).toBeDisabled()

    gate.resolve()
    expect(await screen.findByRole('heading', { name: 'Tickets page' })).toBeInTheDocument()
  })

  it('sends an already logged-in user to the ticket list', async () => {
    renderLogin({ user: buildUser() })
    expect(await screen.findByRole('heading', { name: 'Tickets page' })).toBeInTheDocument()
  })

  it('fills in a demo account with one click', async () => {
    const { user } = renderLogin()

    await user.click(screen.getByRole('button', { name: 'Admin' }))

    expect(screen.getByLabelText('Work email')).toHaveValue('admin@ticketflow.local')
    expect(screen.getByLabelText('Password')).toHaveValue('password123')
  })
})
