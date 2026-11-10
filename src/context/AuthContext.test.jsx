// AuthContext.test.jsx – login and logout with cookie sessions: the user comes from the response and lives only in
// memory, the token in the response is ignored, and logging out clears the user even when the request fails.
import { screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { buildUser } from '../test/factories'
import { renderWithProviders } from '../test/render'
import { API, server, session } from '../test/server'
import { useAuth } from './auth'

// Shows the logged-in user and offers login/logout, like the real pages do
function Probe() {
  const { user, login, logout } = useAuth()
  return (
    <>
      <p>
        {user
          ? `Logged in as ${user.email}${user.must_change_password ? ' (must change password)' : ''}`
          : 'Logged out'}
      </p>
      <button type="button" onClick={() => login('anna@test.local', 'password123')}>
        Log in
      </button>
      <button type="button" onClick={logout}>
        Log out
      </button>
    </>
  )
}

const renderProbe = (options) => renderWithProviders(<Probe />, { route: '/', ...options })

describe('AuthProvider', () => {
  it('login keeps the user from the response, ignores the token in it, and stores nothing', async () => {
    const anna = buildUser({ email: 'anna@test.local' })
    server.use(
      http.post(`${API}/auth/login`, () =>
        HttpResponse.json({ token: 'jwt-in-body', must_change_password: false, user: anna }),
      ),
    )
    const { user } = await renderProbe()
    expect(screen.getByText('Logged out')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Log in' }))

    expect(await screen.findByText('Logged in as anna@test.local')).toBeInTheDocument()
    expect(localStorage.length).toBe(0)
    expect(sessionStorage.length).toBe(0)
    expect(document.body.innerHTML).not.toContain('jwt-in-body')
  })

  it("uses the login response's must_change_password", async () => {
    server.use(
      http.post(`${API}/auth/login`, () =>
        HttpResponse.json({
          must_change_password: true,
          user: buildUser({ email: 'anna@test.local', must_change_password: true }),
        }),
      ),
    )
    const { user } = await renderProbe()

    await user.click(screen.getByRole('button', { name: 'Log in' }))

    expect(await screen.findByText('Logged in as anna@test.local (must change password)')).toBeInTheDocument()
  })

  it('logout calls the backend, which ends the session, and forgets the user', async () => {
    const requests = []
    server.events.on('request:start', ({ request }) =>
      requests.push(`${request.method} ${new URL(request.url).pathname}`),
    )
    const { user } = await renderProbe({ user: buildUser({ email: 'anna@test.local' }) })
    expect(screen.getByText('Logged in as anna@test.local')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Log out' }))

    expect(await screen.findByText('Logged out')).toBeInTheDocument()
    expect(requests).toContain('POST /api/auth/logout')
    expect(session.user).toBeNull()
  })

  it.each([
    ['the server errors', () => HttpResponse.json({ message: 'Server error' }, { status: 500 })],
    ['the server cannot be reached', () => HttpResponse.error()],
  ])('logout still forgets the user when %s', async (_, respond) => {
    server.use(http.post(`${API}/auth/logout`, respond))
    const { user } = await renderProbe({ user: buildUser({ email: 'anna@test.local' }) })

    await user.click(screen.getByRole('button', { name: 'Log out' }))

    expect(await screen.findByText('Logged out')).toBeInTheDocument()
  })
})
