// ForgotPassword.test.jsx – "Forgot password" (/forgot-password) and the link to it on the sign-in page. The backend
// answers every request the same (200 and one message), so the page shows one confirmation whatever happened. Only
// 422 (the email's format) and 429 (too many requests from this address, with a countdown) look different. The
// sign-in page offers the link only when GET /auth/config says email is set up. Rendered through the real App routes.
import { act, screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import App from '../App'
import { renderWithProviders } from '../test/render'
import { API, deferred, server } from '../test/server'

const BACKEND_MESSAGE = "If an account exists for this email, we've sent a password reset link."

function mockForgot(answer) {
  const posted = []
  server.use(
    http.post(`${API}/auth/forgot-password`, async ({ request }) => {
      posted.push(await request.json())
      return answer ? answer() : HttpResponse.json({ message: BACKEND_MESSAGE })
    }),
  )
  return posted
}

const renderAt = (route) => renderWithProviders(null, { route, routes: [{ path: '*', element: <App /> }] })
const emailField = () => screen.getByLabelText('Work email')
const send = () => screen.getByRole('button', { name: 'Send reset link' })

async function submit(user, email = 'a@ticketflow.local') {
  await user.type(emailField(), email)
  await user.click(send())
}

// The one confirmation, the same for every answer the backend gives
async function expectConfirmation() {
  expect(await screen.findByRole('heading', { name: 'Check your email' })).toBeInTheDocument()
  expect(screen.getByRole('status')).toHaveTextContent(BACKEND_MESSAGE)
  expect(screen.getByText(/The link works for 1 hour/)).toBeInTheDocument()
  expect(screen.queryByLabelText('Work email')).not.toBeInTheDocument()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
}

describe('the link on the sign-in page', () => {
  it('is there when email is set up, and takes the typed email along', async () => {
    const { user, router } = await renderAt('/login')
    await user.type(screen.getByLabelText('Work email'), 'liridon@ticketflow.local')
    await user.click(await screen.findByRole('link', { name: 'Forgot password?' }))

    expect(await screen.findByRole('heading', { name: 'Forgot your password?' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/forgot-password')
    expect(emailField()).toHaveValue('liridon@ticketflow.local')
  })

  it.each([
    ['email is not set up', () => HttpResponse.json({ email_enabled: false })],
    ['the config request fails', () => HttpResponse.json({ message: 'x' }, { status: 500 })],
    ['the answer is malformed', () => HttpResponse.json({ email_enabled: 'yes' })],
  ])('is hidden when %s', async (_, answer) => {
    let asked = 0
    server.use(
      http.get(`${API}/auth/config`, () => {
        asked += 1
        return answer()
      }),
    )
    await renderAt('/login')
    await vi.waitFor(() => expect(asked).toBe(1))
    // Give the answer a moment to be applied, then check the link never showed up
    await act(() => new Promise((resolve) => setTimeout(resolve, 20)))
    expect(screen.queryByRole('link', { name: 'Forgot password?' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument()
  })
})

describe('Forgot password', () => {
  it('sends the trimmed email and shows the confirmation instead of the form', async () => {
    const posted = mockForgot()
    const { user } = await renderAt('/forgot-password')
    await submit(user, '  someone@ticketflow.local ')

    await expectConfirmation()
    expect(posted).toEqual([{ email: 'someone@ticketflow.local' }])
    expect(screen.getByRole('link', { name: 'Back to sign in' })).toHaveAttribute('href', '/login')
  })

  // Whatever the server answered, the page says the same thing: it never hints at whether an account exists
  it.each([
    ['the usual 200', () => HttpResponse.json({ message: BACKEND_MESSAGE })],
    ['a 200 with a different message', () => HttpResponse.json({ message: 'No account for that email' })],
    ['a 200 with no body', () => new HttpResponse(null, { status: 200 })],
    ['a 409', () => HttpResponse.json({ message: 'x', code: 'EMAIL_NOT_CONFIGURED' }, { status: 409 })],
    ['a 404', () => HttpResponse.json({ message: 'User not found' }, { status: 404 })],
    ['a 500', () => HttpResponse.json({ message: 'Something went wrong' }, { status: 500 })],
  ])('shows the same confirmation for %s', async (_, answer) => {
    mockForgot(answer)
    const { user } = await renderAt('/forgot-password')
    await submit(user)
    await expectConfirmation()
    expect(screen.queryByText(/No account|not found|went wrong/)).not.toBeInTheDocument()
  })

  it('checks the email before sending', async () => {
    const posted = mockForgot()
    const { user } = await renderAt('/forgot-password')
    await user.click(send())
    expect(emailField()).toHaveAccessibleDescription('Email is required')
    await user.type(emailField(), 'not-an-email')
    await user.click(send())
    expect(emailField()).toHaveAccessibleDescription('Enter a valid email')
    expect(posted).toEqual([])
  })

  it("shows the backend's format error (422) under the field, and keeps the form", async () => {
    mockForgot(() =>
      HttpResponse.json(
        {
          message: 'Email must be 150 characters or less',
          errors: [{ field: 'email', message: 'Email must be 150 characters or less' }],
        },
        { status: 422 },
      ),
    )
    const { user } = await renderAt('/forgot-password')
    await submit(user)
    expect(await screen.findByText('Email must be 150 characters or less')).toBeInTheDocument()
    expect(emailField()).toHaveAttribute('aria-invalid', 'true')
    expect(screen.queryByRole('heading', { name: 'Check your email' })).not.toBeInTheDocument()
  })

  it('disables the button and shows "Sending…" while the request runs; a second click sends nothing', async () => {
    const pending = deferred()
    const posted = mockForgot(async () => (await pending.promise, HttpResponse.json({ message: BACKEND_MESSAGE })))
    const { user } = await renderAt('/forgot-password')
    await submit(user)
    const button = await screen.findByRole('button', { name: 'Sending…' })
    expect(button).toBeDisabled()
    await user.click(button)
    pending.resolve()
    await expectConfirmation()
    expect(posted).toHaveLength(1)
  })

  it('says so when the server cannot be reached (nothing was asked)', async () => {
    mockForgot(() => HttpResponse.error())
    const { user } = await renderAt('/forgot-password')
    await submit(user)
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't reach the server. Please try again.")
    expect(emailField()).toHaveValue('a@ticketflow.local')
  })

  describe('too many requests (429)', () => {
    const rateLimited = (retryAfter) => () =>
      HttpResponse.json(
        { message: 'Too many requests. Wait a few minutes and try again.', code: 'RATE_LIMITED' },
        { status: 429, headers: retryAfter ? { 'Retry-After': String(retryAfter) } : {} },
      )
    // Intervals and the clock are fake; userEvent's own timeouts stay real
    const fakeClock = () => vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('counts down from Retry-After with the button disabled, then gives the button back', async () => {
      fakeClock()
      const posted = mockForgot(rateLimited(90))
      const { user } = await renderAt('/forgot-password')
      await submit(user)

      const alert = await screen.findByRole('alert')
      expect(alert).toHaveTextContent('Too many requests. Try again in 1:30.')
      expect(within(alert).getByRole('timer')).toHaveTextContent('1:30')
      expect(screen.getByRole('button', { name: 'Try again in 1:30' })).toBeDisabled()

      act(() => vi.advanceTimersByTime(60_000))
      expect(screen.getByRole('timer')).toHaveTextContent('0:30')
      // Enter in the form doesn't send either
      await user.type(emailField(), '{Enter}')
      expect(posted).toHaveLength(1)

      act(() => vi.advanceTimersByTime(30_000))
      expect(send()).toBeEnabled()
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      expect(screen.queryByRole('heading', { name: 'Check your email' })).not.toBeInTheDocument()
    })

    it('longer waits read "about N minutes"', async () => {
      mockForgot(rateLimited(15 * 60))
      const { user } = await renderAt('/forgot-password')
      await submit(user)
      expect(await screen.findByRole('timer')).toHaveTextContent('about 15 minutes')
    })

    it('without Retry-After it says to wait a few minutes, and the button stays usable', async () => {
      mockForgot(rateLimited(null))
      const { user } = await renderAt('/forgot-password')
      await submit(user)
      expect(await screen.findByRole('alert')).toHaveTextContent('Too many requests. Wait a few minutes and try again.')
      expect(send()).toBeEnabled()
    })
  })
})
