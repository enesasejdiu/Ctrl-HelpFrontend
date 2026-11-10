// ChangePassword.test.jsx – choosing a new password: the forced version after a temporary password, the voluntary
// version from the top bar, the client-side rules, and a wrong current password (which must not log the user out).
import { screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { buildUser } from '../test/factories'
import { renderReady } from '../test/render'
import { API, getSessionUser, server, setSessionUser } from '../test/server'
import ChangePassword from './ChangePassword'

const GOOD_PASSWORD = 'NewPassword42'

// Records each request body; answers like the backend unless `respond` is given
function mockChangePassword(respond) {
  const requests = []
  server.use(
    http.post(`${API}/auth/change-password`, async ({ request }) => {
      const body = await request.json()
      requests.push(body)
      if (respond) return respond(body)
      // Like the backend: the same user, flag cleared, with fresh session cookies (the mock session)
      const changed = { ...getSessionUser(), must_change_password: false }
      setSessionUser(changed)
      return HttpResponse.json({ message: 'Password changed', user: changed })
    }),
  )
  return requests
}

async function renderPage({ user = buildUser({ must_change_password: true }), from } = {}) {
  return renderReady(<ChangePassword />, {
    route: { pathname: '/change-password', state: from ? { from: { pathname: from } } : undefined },
    user,
  })
}

// Pastes each value instead of typing it key by key: typing a 70+ character password could pass the 5s test limit on
// a busy machine, and the unfinished typing then spilled into the next test's form
async function enter(user, field, value) {
  await user.click(field)
  await user.paste(value)
}

async function fill(user, { current = 'Temp1234abcd', next = GOOD_PASSWORD, confirm = next } = {}) {
  if (current) await enter(user, screen.getByLabelText(/Temporary password|Current password/), current)
  if (next) await enter(user, screen.getByLabelText('New password'), next)
  if (confirm) await enter(user, screen.getByLabelText('Repeat new password'), confirm)
  await user.click(screen.getByRole('button', { name: 'Save new password' }))
}

describe('ChangePassword', () => {
  it('after a temporary password: explains why, saves, clears the flag and goes to the page the user wanted', async () => {
    const requests = mockChangePassword()
    const { user, router } = await renderPage({ from: '/tickets/42' })

    expect(screen.getByRole('heading', { name: 'Choose your own password' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Cancel' })).not.toBeInTheDocument()

    await fill(user)

    expect(await screen.findByRole('heading', { name: 'Ticket 42' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/tickets/42')
    expect(requests).toEqual([{ currentPassword: 'Temp1234abcd', newPassword: GOOD_PASSWORD }])
    expect(localStorage.length).toBe(0)
  })

  it('stays logged in after the change through the fresh cookie, and keeps no token itself', async () => {
    // The backend still sends a token in the body for older clients; the app must ignore it
    mockChangePassword(() => {
      const changed = { ...getSessionUser(), must_change_password: false }
      setSessionUser(changed)
      return HttpResponse.json({ message: 'Password changed', token: 'fresh-token', user: changed })
    })
    const { user } = await renderPage({ from: '/tickets/42' })

    await fill(user)

    expect(await screen.findByRole('heading', { name: 'Ticket 42' })).toBeInTheDocument()
    expect(getSessionUser()).not.toBeNull() // no logout happened
    expect(localStorage.length).toBe(0)
  })

  it('goes to the ticket list when there is no page to return to', async () => {
    mockChangePassword()
    const { user } = await renderPage()
    await fill(user)
    expect(await screen.findByRole('heading', { name: 'Tickets page' })).toBeInTheDocument()
  })

  it('opened from the top bar: asks for the current password and can be cancelled', async () => {
    const { user } = await renderPage({ user: buildUser({ must_change_password: false }), from: '/tickets' })

    expect(screen.getByRole('heading', { name: 'Change password' })).toBeInTheDocument()
    expect(screen.getByLabelText('Current password')).toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: 'Cancel' }))
    expect(await screen.findByRole('heading', { name: 'Tickets page' })).toBeInTheDocument()
  })

  it.each([
    ['no current password', { current: '' }, 'Temporary password is required'],
    ['too short', { next: 'Short1' }, 'New password must be at least 10 characters'],
    ['no number', { next: 'OnlyLettersHere' }, 'New password must contain at least one number'],
    ['no letter', { next: '1234567890' }, 'New password must contain at least one letter'],
    ['too long', { next: `a1${'x'.repeat(71)}` }, 'New password must be 72 characters or less'],
    ['same as current', { current: GOOD_PASSWORD }, 'New password must be different from the current one'],
    ['repeat does not match', { confirm: 'NewPassword43' }, 'The new passwords do not match'],
  ])('refuses %s without calling the server', async (_, values, message) => {
    const requests = mockChangePassword()
    const { user } = await renderPage()

    await fill(user, values)

    expect(screen.getByRole('alert')).toHaveTextContent(message)
    expect(requests).toHaveLength(0)
  })

  it('shows a wrong current password and stays logged in', async () => {
    mockChangePassword(() => HttpResponse.json({ message: 'Current password is wrong' }, { status: 401 }))
    const { user, router } = await renderPage()

    await fill(user)

    expect(await screen.findByRole('alert')).toHaveTextContent('Current password is wrong')
    expect(router.state.location.pathname).toBe('/change-password')
    expect(getSessionUser()).not.toBeNull() // still logged in: a wrong password is not an expired session
    expect(screen.getByRole('button', { name: 'Save new password' })).toBeEnabled()
  })

  it('lets a user with a temporary password log out instead', async () => {
    const { user } = await renderPage()

    await user.click(screen.getByRole('button', { name: 'Log out' }))

    expect(await screen.findByRole('heading', { name: 'Login page' })).toBeInTheDocument()
    expect(getSessionUser()).toBeNull() // POST /auth/logout was called
  })
})
