// SetPasswordWithLink.test.jsx – /set-password?token=..., the page a one-time link opens (a new account's setup link,
// an Admin/HR reset link, or a "Forgot password" link). Public (no login): it takes the token out of the URL, checks the link, says what to do
// when a link can't be used, sets the password with the live rule checklist, and ends on the sign-in page with
// "Password set, please log in." Rendered through the real App routes, so the /set-password split (link page vs. the
// logged-in temporary-password page) is the one the app uses.
import { act, screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import App from '../App'
import { buildUser } from '../test/factories'
import { renderWithProviders } from '../test/render'
import { API, deferred, server } from '../test/server'

const LINK_TOKEN = 'abcDEF123_-xyzLinkTokenFromTheEmail000000000'
const GOOD = 'my-own-pass42'
const ASK = 'Ask your administrator or HR for a new link.'

// GET /auth/set-password/validate and POST /auth/set-password, answering like the backend. Returns what they got.
function mockApi({ validate, set, purpose = 'setup' } = {}) {
  const calls = { validated: [], posted: [] }
  server.use(
    http.get(`${API}/auth/set-password/validate`, ({ request }) => {
      const token = new URL(request.url).searchParams.get('token')
      calls.validated.push(token)
      if (validate) return validate(token)
      return HttpResponse.json({
        status: 'valid',
        purpose,
        email: 'nora@ticketflow.local',
        expires_at: '2026-11-12T10:00:00Z',
      })
    }),
    http.post(`${API}/auth/set-password`, async ({ request }) => {
      const body = await request.json()
      calls.posted.push(body)
      if (set) return set(body)
      return HttpResponse.json({ message: 'Password set, please log in.' })
    }),
  )
  return calls
}

async function openLink(options = {}) {
  return renderWithProviders(null, {
    route: `/set-password?token=${encodeURIComponent(LINK_TOKEN)}`,
    routes: [{ path: '*', element: <App /> }],
    ...options,
  })
}

const field = (label) => screen.getByLabelText(label)
const submit = () => screen.getByRole('button', { name: 'Set password' })
const rule = (name) =>
  within(screen.getByRole('list', { name: 'Password rules' }))
    .getByText(name)
    .closest('li')
const referrerMeta = () => document.head.querySelector('meta[name="referrer"]')

async function typePasswords(user, next, confirm = next) {
  await user.type(field('New password'), next)
  await user.type(field('Confirm new password'), confirm)
}

describe('Set your password (one-time link)', () => {
  it('needs no login: checks the link, then shows the form for that email', async () => {
    const calls = mockApi()
    const { router } = await openLink()

    expect(await screen.findByText('Choose a password for nora@ticketflow.local.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Set your password' })).toBeInTheDocument()
    expect(calls.validated).toEqual([LINK_TOKEN])
    expect(router.state.location.pathname).toBe('/set-password')
    // Not the temporary-password page: no field for one, and no app menu
    expect(screen.queryByLabelText('Temporary password')).not.toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument()
  })

  it('a reset link says the password was reset', async () => {
    mockApi({ purpose: 'reset' })
    await openLink()
    expect(await screen.findByRole('heading', { name: 'Choose a new password' })).toBeInTheDocument()
    expect(screen.getByText('Your password was reset. Choose a new one for nora@ticketflow.local.')).toBeInTheDocument()
  })

  it('a "Forgot password" link asks for a new password', async () => {
    mockApi({ purpose: 'forgot' })
    await openLink()
    expect(await screen.findByRole('heading', { name: 'Choose a new password' })).toBeInTheDocument()
    expect(screen.getByText('Choose a new password for nora@ticketflow.local.')).toBeInTheDocument()
    expect(screen.queryByText(/was reset/)).not.toBeInTheDocument()
  })

  it('takes the token out of the URL (history and Referer) and sets no-referrer while the page is open', async () => {
    const calls = mockApi()
    const { router } = await openLink()
    await screen.findByRole('button', { name: 'Set password' })

    expect(router.state.location.search).toBe('')
    expect(window.location.href).not.toContain(LINK_TOKEN)
    expect(JSON.stringify(router.state.location.state ?? null)).not.toContain(LINK_TOKEN)
    expect(referrerMeta()).toHaveAttribute('content', 'no-referrer')
    // The token was still used for the check, from memory
    expect(calls.validated).toEqual([LINK_TOKEN])
  })

  it('the no-referrer tag goes away with the page', async () => {
    mockApi()
    const { router } = await openLink()
    await screen.findByRole('button', { name: 'Set password' })
    await act(() => router.navigate('/login'))
    await screen.findByRole('button', { name: 'Sign in' })
    expect(referrerMeta()).toBeNull()
  })

  it('shows "Checking your link…" while the check runs', async () => {
    const pending = deferred()
    mockApi({
      validate: async () => (
        await pending.promise,
        HttpResponse.json({ status: 'valid', purpose: 'setup', email: 'n@x.local' })
      ),
    })
    await openLink()
    expect(await screen.findByText('Checking your link…')).toBeInTheDocument()
    pending.resolve()
    expect(await screen.findByRole('button', { name: 'Set password' })).toBeInTheDocument()
  })

  it.each([
    ['expired', 'This link has expired'],
    ['used', 'This link has already been used'],
    ['invalid', 'This link is not valid'],
  ])(
    'a setup, reset or unknown link that is %s says so, says to ask an administrator or HR, and shows no form',
    async (status, title) => {
      mockApi({
        validate: () =>
          HttpResponse.json({
            status,
            purpose: null,
            message: 'from the server',
            code: `TOKEN_${status.toUpperCase()}`,
          }),
      })
      await openLink()

      expect(await screen.findByRole('heading', { name: title })).toBeInTheDocument()
      expect(screen.getByRole('alert')).toHaveTextContent(ASK)
      // No "Request a new link": Forgot password sends nothing to an account that hasn't set its own password
      expect(screen.queryByRole('link', { name: 'Request a new link' })).not.toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Go to sign in' })).toHaveAttribute('href', '/login')
      expect(screen.queryByLabelText('New password')).not.toBeInTheDocument()
    },
  )

  it.each([
    ['expired', 'This link has expired'],
    ['used', 'This link has already been used'],
  ])('a "Forgot password" link that is %s links back to /forgot-password', async (status, title) => {
    mockApi({
      validate: () =>
        HttpResponse.json({
          status,
          purpose: 'forgot',
          message: 'from the server',
          code: `TOKEN_${status.toUpperCase()}`,
        }),
    })
    await openLink()

    expect(await screen.findByRole('heading', { name: title })).toBeInTheDocument()
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('Reset links work for 1 hour and only once. You can request a new one.')
    expect(alert).not.toHaveTextContent(ASK)
    expect(screen.getByRole('link', { name: 'Request a new link' })).toHaveAttribute('href', '/forgot-password')
  })

  it('"Request a new link" opens the Forgot password page', async () => {
    mockApi({ validate: () => HttpResponse.json({ status: 'expired', purpose: 'forgot', code: 'TOKEN_EXPIRED' }) })
    const { user, router } = await openLink()
    await user.click(await screen.findByRole('link', { name: 'Request a new link' }))
    expect(router.state.location.pathname).toBe('/forgot-password')
  })

  it('a failed check (server down) offers no new-link button, only the error', async () => {
    mockApi({ validate: () => HttpResponse.json({ message: 'Something went wrong on the server' }, { status: 500 }) })
    await openLink()
    await screen.findByRole('alert')
    expect(screen.queryByRole('link', { name: 'Request a new link' })).not.toBeInTheDocument()
  })

  it('a failed check (server down) is shown as an error', async () => {
    mockApi({ validate: () => HttpResponse.json({ message: 'Something went wrong on the server' }, { status: 500 }) })
    await openLink()
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong on the server')
  })

  it('the checklist follows the typing, and the button only works once every rule passes', async () => {
    mockApi()
    const { user } = await openLink()
    await screen.findByRole('button', { name: 'Set password' })
    expect(submit()).toBeDisabled()

    await user.type(field('New password'), 'short1')
    expect(rule('A letter')).toHaveClass('is-met')
    expect(rule('A number')).toHaveClass('is-met')
    expect(rule('At least 10 characters')).not.toHaveClass('is-met')
    expect(rule('At least 10 characters')).toHaveTextContent('(not yet)')

    await user.type(field('New password'), 'longer')
    await user.type(field('Confirm new password'), 'short1long')
    expect(rule('Both new passwords match')).not.toHaveClass('is-met')
    expect(submit()).toBeDisabled()

    await user.type(field('Confirm new password'), 'er')
    expect(rule('Both new passwords match')).toHaveClass('is-met')
    expect(submit()).toBeEnabled()
  })

  it('sets the password and opens sign-in with "Password set, please log in." and the email filled in', async () => {
    const calls = mockApi()
    const { user, router } = await openLink()
    await screen.findByRole('button', { name: 'Set password' })
    await typePasswords(user, GOOD)
    await user.click(submit())

    expect(await screen.findByText('Password set, please log in.')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
    expect(calls.posted).toEqual([{ token: LINK_TOKEN, new_password: GOOD }])
    expect(screen.getByLabelText('Work email')).toHaveValue('nora@ticketflow.local')
    expect(JSON.stringify(router.state.location)).not.toContain(LINK_TOKEN)
  })

  it('a link that stopped working meanwhile (e.g. used in another tab) switches to its message', async () => {
    mockApi({
      set: () =>
        HttpResponse.json({ message: 'This link has already been used.', code: 'TOKEN_USED' }, { status: 400 }),
    })
    const { user } = await openLink()
    await screen.findByRole('button', { name: 'Set password' })
    await typePasswords(user, GOOD)
    await user.click(submit())

    expect(await screen.findByRole('heading', { name: 'This link has already been used' })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent(ASK)
    expect(screen.queryByLabelText('New password')).not.toBeInTheDocument()
  })

  it('a "Forgot password" link that expired meanwhile still links back to /forgot-password', async () => {
    mockApi({
      purpose: 'forgot',
      set: () => HttpResponse.json({ message: 'This link has expired.', code: 'TOKEN_EXPIRED' }, { status: 400 }),
    })
    const { user } = await openLink()
    await screen.findByRole('button', { name: 'Set password' })
    await typePasswords(user, GOOD)
    await user.click(submit())

    expect(await screen.findByRole('heading', { name: 'This link has expired' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Request a new link' })).toHaveAttribute('href', '/forgot-password')
  })

  it("shows the backend's password rule (422) under the field", async () => {
    mockApi({
      set: () =>
        HttpResponse.json(
          {
            message: 'New password must be 72 characters or less',
            code: 'WEAK_PASSWORD',
            errors: [{ field: 'new_password', message: 'New password must be 72 characters or less' }],
          },
          { status: 422 },
        ),
    })
    const { user } = await openLink()
    await screen.findByRole('button', { name: 'Set password' })
    await typePasswords(user, GOOD)
    await user.click(submit())

    expect(await screen.findByText('New password must be 72 characters or less')).toBeInTheDocument()
    expect(field('New password')).toHaveAttribute('aria-invalid', 'true')
    expect(submit()).toBeEnabled()
  })

  it('/set-password without a token is still the logged-in temporary-password page', async () => {
    const calls = mockApi()
    server.use(http.get(`${API}/tickets`, () => HttpResponse.json([])))
    await renderWithProviders(null, {
      route: '/set-password',
      routes: [{ path: '*', element: <App /> }],
      user: buildUser({ must_change_password: true }),
    })
    expect(await screen.findByLabelText('Temporary password')).toBeInTheDocument()
    expect(calls.validated).toEqual([])
    expect(referrerMeta()).toBeNull()
  })

  it('/set-password without a token and without a login goes to sign-in', async () => {
    const { router } = await renderWithProviders(null, {
      route: '/set-password',
      routes: [{ path: '*', element: <App /> }],
    })
    await screen.findByRole('button', { name: 'Sign in' })
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
  })
})
