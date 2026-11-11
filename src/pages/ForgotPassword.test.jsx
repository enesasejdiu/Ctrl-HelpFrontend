// ForgotPassword.test.jsx – "Forgot password" (/forgot-password) and the link to it on the sign-in page. The backend
// always answers the same, sends an active account a one-time reset link, and answers 409 EMAIL_NOT_CONFIGURED when
// it has no email. Rendered through the real App routes.
import { screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import App from '../App'
import { renderWithProviders } from '../test/render'
import { API, deferred, server } from '../test/server'

const SENT =
  "If there's an active account for that email, we've sent it a link to choose a new password. It expires in 48 hours."

function mockForgot(answer) {
  const posted = []
  server.use(
    http.post(`${API}/auth/forgot-password`, async ({ request }) => {
      posted.push(await request.json())
      return answer ? answer() : HttpResponse.json({ message: SENT })
    }),
  )
  return posted
}

const renderAt = (route) => renderWithProviders(null, { route, routes: [{ path: '*', element: <App /> }] })
const emailField = () => screen.getByLabelText('Work email')
const send = () => screen.getByRole('button', { name: 'Send reset link' })

describe('Forgot password', () => {
  it('the sign-in page links to it, taking the typed email along', async () => {
    const { user, router } = await renderAt('/login')
    await user.type(screen.getByLabelText('Work email'), 'liridon@ticketflow.local')
    await user.click(screen.getByRole('link', { name: 'Forgot password?' }))

    expect(await screen.findByRole('heading', { name: 'Forgot your password?' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/forgot-password')
    expect(emailField()).toHaveValue('liridon@ticketflow.local')
  })

  it('sends the email and shows the same answer the backend gives anyone, without the form', async () => {
    const posted = mockForgot()
    const { user } = await renderAt('/forgot-password')
    await user.type(emailField(), '  someone@ticketflow.local ')
    await user.click(send())

    expect(await screen.findByRole('heading', { name: 'Check your email' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(SENT)
    expect(screen.getByText(/Your current password keeps working until you use the link/)).toBeInTheDocument()
    expect(posted).toEqual([{ email: 'someone@ticketflow.local' }])
    expect(screen.queryByLabelText('Work email')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to sign in' })).toHaveAttribute('href', '/login')
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

  it('shows "Sending…" while the request runs', async () => {
    const pending = deferred()
    mockForgot(async () => (await pending.promise, HttpResponse.json({ message: SENT })))
    const { user } = await renderAt('/forgot-password')
    await user.type(emailField(), 'a@ticketflow.local')
    await user.click(send())
    expect(await screen.findByRole('button', { name: 'Sending…' })).toBeDisabled()
    pending.resolve()
    expect(await screen.findByRole('heading', { name: 'Check your email' })).toBeInTheDocument()
  })

  it('without email on the backend (409 EMAIL_NOT_CONFIGURED) it says to ask an administrator or HR', async () => {
    mockForgot(() => HttpResponse.json({ message: 'from the server', code: 'EMAIL_NOT_CONFIGURED' }, { status: 409 }))
    const { user } = await renderAt('/forgot-password')
    await user.type(emailField(), 'a@ticketflow.local')
    await user.click(send())
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Password reset by email isn't available. Ask your administrator or HR to reset your password.",
    )
    expect(emailField()).toHaveValue('a@ticketflow.local')
  })

  it('too many requests (429) says to wait', async () => {
    mockForgot(() => HttpResponse.json({ message: 'x', code: 'RATE_LIMITED' }, { status: 429 }))
    const { user } = await renderAt('/forgot-password')
    await user.type(emailField(), 'a@ticketflow.local')
    await user.click(send())
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many requests. Wait a few minutes and try again.')
  })

  it("shows the backend's email error under the field", async () => {
    mockForgot(() =>
      HttpResponse.json(
        {
          message: 'Email must be 150 characters or less',
          errors: [{ field: 'email', message: 'Email must be 150 characters or less' }],
        },
        { status: 400 },
      ),
    )
    const { user } = await renderAt('/forgot-password')
    await user.type(emailField(), 'a@ticketflow.local')
    await user.click(send())
    expect(await screen.findByText('Email must be 150 characters or less')).toBeInTheDocument()
    expect(emailField()).toHaveAttribute('aria-invalid', 'true')
  })
})
