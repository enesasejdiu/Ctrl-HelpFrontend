// SetPassword.test.jsx – the "Set your password" page after logging in with a temporary password: every other page
// redirects to it, the top bar shows only the logo and Log out, the checklist, backend errors, and success.
// Rendered through the real App routes, so ProtectedRoute and the Layout are the ones the app uses.
import { act, screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import App from '../App'
import { buildUser } from '../test/factories'
import { renderReady } from '../test/render'
import { API, getSessionUser, server, setSessionUser } from '../test/server'

const TEMPORARY = 'Tmp4uK9pQw2xZr'
const GOOD = 'my-own-pass42'

// Pages a flagged user might try; GET /tickets answers like the backend does for them
function mockApi({ change } = {}) {
  const bodies = []
  server.use(
    http.get(`${API}/tickets`, () => HttpResponse.json([])),
    http.post(`${API}/auth/change-password`, async ({ request }) => {
      const body = await request.json()
      bodies.push(body)
      if (change) return change(body)
      // Like the backend: the same user, flag cleared, with fresh session cookies (the mock session)
      const changed = { ...getSessionUser(), must_change_password: false }
      setSessionUser(changed)
      return HttpResponse.json({ message: 'Password changed', user: changed })
    }),
  )
  return bodies
}

async function renderApp(route, user = buildUser({ must_change_password: true })) {
  return renderReady(null, { route, routes: [{ path: '*', element: <App /> }], user })
}

const field = (label) => screen.getByLabelText(label)
const submit = () => screen.getByRole('button', { name: 'Set password' })
const rule = (name) => within(screen.getByRole('list', { name: 'Password rules' })).getByText(name).closest('li')

describe('Set your password', () => {
  it.each(['/tickets', '/tickets/new', '/tickets/7', '/change-password', '/somewhere-else'])(
    'a flagged user opening %s lands on the page',
    async (route) => {
      mockApi()
      const { router } = await renderApp(route)
      expect(await screen.findByRole('heading', { name: 'Set your password' })).toBeInTheDocument()
      expect(router.state.location.pathname).toBe('/set-password')
      expect(screen.getByText('Your account uses a temporary password. Choose your own to continue.')).toBeInTheDocument()
    },
  )

  it.each([
    ['admin', '/admin'],
    ['admin', '/admin/users'],
    ['hr', '/admin/users'],
  ])('a flagged %s is kept out of %s too', async (role, route) => {
    mockApi()
    const { router } = await renderApp(route, buildUser({ role, must_change_password: true }))
    expect(await screen.findByRole('heading', { name: 'Set your password' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/set-password')
  })

  it('the top bar shows only the logo and Log out', async () => {
    mockApi()
    await renderApp('/tickets', buildUser({ role: 'admin', must_change_password: true }))
    await screen.findByRole('heading', { name: 'Set your password' })

    expect(within(screen.getByRole('navigation', { name: 'Main' })).queryAllByRole('link')).toHaveLength(0)
    expect(screen.queryByRole('link', { name: 'Change password' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'TicketFlow home' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Log out' })).toBeInTheDocument()
  })

  it('a 403 PASSWORD_CHANGE_REQUIRED during a session sends the user to the page', async () => {
    // The session's user is not flagged (yet): only the 403 can send them to the page
    server.use(
      http.get(`${API}/tickets`, () =>
        HttpResponse.json(
          { message: 'You must change your password before continuing', code: 'PASSWORD_CHANGE_REQUIRED' },
          { status: 403 },
        ),
      ),
    )
    const { router } = await renderApp('/tickets', buildUser())
    expect(await screen.findByRole('heading', { name: 'Set your password' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/set-password')
  })

  it('the checklist follows what is typed, and the button waits until every rule passes', async () => {
    mockApi()
    const { user } = await renderApp('/set-password')
    await screen.findByRole('heading', { name: 'Set your password' })

    const met = () => ['At least 10 characters', 'A letter', 'A number', 'Both new passwords match'].filter((n) => rule(n).classList.contains('is-met'))
    expect(met()).toEqual([])
    expect(rule('A letter')).toHaveTextContent('(not yet)')
    expect(submit()).toBeDisabled()

    await user.type(field('Temporary password'), TEMPORARY)
    await user.type(field('New password'), 'abc')
    expect(met()).toEqual(['A letter'])
    expect(rule('A letter')).toHaveTextContent('(done)')

    await user.type(field('New password'), '1')
    expect(met()).toEqual(['A letter', 'A number'])

    await user.type(field('New password'), 'defghi') // abc1defghi = 10 characters
    expect(met()).toEqual(['At least 10 characters', 'A letter', 'A number'])
    expect(submit()).toBeDisabled()

    await user.type(field('Confirm new password'), 'abc1defghi')
    expect(met()).toHaveLength(4)
    expect(submit()).toBeEnabled()
  })

  it('a mismatch keeps "match" unchecked and the button disabled', async () => {
    mockApi()
    const { user } = await renderApp('/set-password')
    await screen.findByRole('heading', { name: 'Set your password' })
    await user.type(field('Temporary password'), TEMPORARY)
    await user.type(field('New password'), GOOD)
    await user.type(field('Confirm new password'), `${GOOD}x`)

    expect(rule('Both new passwords match')).not.toHaveClass('is-met')
    expect(submit()).toBeDisabled()
    await user.type(field('Confirm new password'), '{Backspace}')
    expect(rule('Both new passwords match')).toHaveClass('is-met')
    expect(submit()).toBeEnabled()
  })

  it('needs the temporary password too', async () => {
    mockApi()
    const { user } = await renderApp('/set-password')
    await screen.findByRole('heading', { name: 'Set your password' })
    await user.type(field('New password'), GOOD)
    await user.type(field('Confirm new password'), GOOD)
    expect(submit()).toBeDisabled()
  })

  it.each([
    ['400 INVALID_CURRENT_PASSWORD', 400, { message: 'Current password is wrong', code: 'INVALID_CURRENT_PASSWORD' }],
    ['401 (older backend)', 401, { message: 'Current password is wrong' }],
  ])('a wrong temporary password (%s) shows under its field, and the user stays logged in', async (_, status, body) => {
    mockApi({ change: () => HttpResponse.json(body, { status }) })
    const { user, router } = await renderApp('/set-password')
    await screen.findByRole('heading', { name: 'Set your password' })
    await user.type(field('Temporary password'), 'wrong-one')
    await user.type(field('New password'), GOOD)
    await user.type(field('Confirm new password'), GOOD)
    await user.click(submit())

    await waitFor(() => expect(field('Temporary password')).toHaveAccessibleDescription('Current password is wrong'))
    expect(router.state.location.pathname).toBe('/set-password')
    expect(getSessionUser()).not.toBeNull() // still logged in: a wrong password is not an expired session
  })

  it('other backend errors are shown (e.g. the same password again)', async () => {
    mockApi({ change: () => HttpResponse.json({ message: 'New password must be different from the current one' }, { status: 400 }) })
    const { user } = await renderApp('/set-password')
    await screen.findByRole('heading', { name: 'Set your password' })
    await user.type(field('Temporary password'), GOOD)
    await user.type(field('New password'), GOOD)
    await user.type(field('Confirm new password'), GOOD)
    await user.click(submit())
    expect(await screen.findByRole('alert')).toHaveTextContent('New password must be different from the current one')
  })

  it('success clears the flag, opens the ticket list and says "Password changed"', async () => {
    const bodies = mockApi()
    const { user, router } = await renderApp('/tickets/new')
    await screen.findByRole('heading', { name: 'Set your password' })
    await user.type(field('Temporary password'), TEMPORARY)
    await user.type(field('New password'), GOOD)
    await user.type(field('Confirm new password'), GOOD)
    await user.click(submit())

    expect(await screen.findByRole('heading', { name: 'My tickets' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/tickets')
    expect(screen.getByRole('status')).toHaveTextContent('Password changed')
    expect(bodies).toEqual([{ currentPassword: TEMPORARY, newPassword: GOOD }])
    expect(localStorage.length).toBe(0)
    // The menu is back, and other pages open again
    expect(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', { name: 'New ticket' })).toBeInTheDocument()
    await act(() => router.navigate('/tickets/new'))
    expect(await screen.findByRole('heading', { name: 'New ticket' })).toBeInTheDocument()
  })

  it('an unflagged user never sees it: /set-password goes to the ticket list', async () => {
    mockApi()
    const { router } = await renderApp('/set-password', buildUser())
    expect(await screen.findByRole('heading', { name: 'My tickets' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/tickets')
    expect(screen.queryByText('Password changed')).not.toBeInTheDocument()
  })

  it('Log out works from the page', async () => {
    mockApi()
    const { user, router } = await renderApp('/set-password')
    await screen.findByRole('heading', { name: 'Set your password' })
    await user.click(screen.getByRole('button', { name: 'Log out' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
    expect(getSessionUser()).toBeNull() // POST /auth/logout was called
  })
})

