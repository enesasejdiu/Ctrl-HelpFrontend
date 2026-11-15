// LogoutEverywhere.test.jsx – "Log out everywhere" on the profile page: it asks first, then POST /auth/logout-all, and
// the login page says "You've been signed out everywhere."; Cancel, Escape and a failed request keep you logged in.
import { act, screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import Layout from '../components/Layout'
import ProtectedRoute from '../components/ProtectedRoute'
import { buildUser } from '../test/factories'
import { renderWithProviders } from '../test/render'
import { API, server, session } from '../test/server'
import Login from './Login'
import Profile from './Profile'

// Mirrors App.jsx, with the real login page so its message can be checked
const routes = [
  { path: '/login', element: <Login /> },
  {
    element: <ProtectedRoute />,
    children: [{ element: <Layout />, children: [{ path: '/profile', element: <Profile /> }] }],
  },
]

async function renderProfile({ reply = () => new HttpResponse(null, { status: 204 }) } = {}) {
  const calls = []
  server.use(
    http.post(`${API}/auth/logout-all`, () => {
      calls.push('logout-all')
      const response = reply()
      if (response.status === 204) session.user = null // like the backend ending every session
      return response
    }),
  )
  const view = await renderWithProviders(null, { route: '/profile', routes, user: buildUser() })
  const card = await screen.findByRole('region', { name: 'Password' })
  return { ...view, calls, card }
}

const openDialog = async (user, card) => {
  await user.click(within(card).getByRole('button', { name: 'Log out everywhere' }))
  return screen.getByRole('alertdialog', { name: 'Log out everywhere?' })
}

describe('Log out everywhere', () => {
  it('asks first, explaining it includes this device; Cancel is focused and the request waits', async () => {
    const { user, card, calls } = await renderProfile()

    const dialog = await openDialog(user, card)

    expect(within(dialog).getByText('This signs you out on all your devices, including this one.')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus()
    expect(calls).toEqual([])
  })

  it('logs out everywhere and shows the message on the login page', async () => {
    const { user, card, calls, router } = await renderProfile()

    const dialog = await openDialog(user, card)
    await user.click(within(dialog).getByRole('button', { name: 'Log out everywhere' }))

    expect(await screen.findByText("You've been signed out everywhere.")).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument()
    expect(calls).toEqual(['logout-all'])
    // Not the "session ended" message a 401 would show
    expect(screen.queryByText('Your session has ended. Please sign in again.')).not.toBeInTheDocument()
  })

  it('shows the message once: opening a protected page again while logged out goes to login without it', async () => {
    const { user, card, router } = await renderProfile()

    await user.click(within(await openDialog(user, card)).getByRole('button', { name: 'Log out everywhere' }))
    expect(await screen.findByText("You've been signed out everywhere.")).toBeInTheDocument()

    await act(() => router.navigate('/profile'))

    expect(router.state.location.pathname).toBe('/login')
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument()
    expect(screen.queryByText("You've been signed out everywhere.")).not.toBeInTheDocument()
  })

  it('Cancel and Escape close the dialog, keep you logged in, and put focus back on the button', async () => {
    const { user, card, calls } = await renderProfile()

    await user.click(within(await openDialog(user, card)).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(within(card).getByRole('button', { name: 'Log out everywhere' })).toHaveFocus()

    await openDialog(user, card)
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()

    expect(calls).toEqual([])
    expect(screen.getByRole('heading', { name: 'My profile' })).toBeInTheDocument()
  })

  it('a failed request keeps you logged in, says why, and can be tried again', async () => {
    let fail = true
    const { user, card, calls, router } = await renderProfile({
      reply: () =>
        fail
          ? HttpResponse.json({ message: 'Something went wrong on the server' }, { status: 500 })
          : new HttpResponse(null, { status: 204 }),
    })

    const dialog = await openDialog(user, card)
    await user.click(within(dialog).getByRole('button', { name: 'Log out everywhere' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Something went wrong on the server')
    expect(router.state.location.pathname).toBe('/profile')
    expect(within(dialog).getByRole('button', { name: 'Log out everywhere' })).toBeEnabled()

    fail = false
    await user.click(within(dialog).getByRole('button', { name: 'Log out everywhere' }))
    expect(await screen.findByText("You've been signed out everywhere.")).toBeInTheDocument()
    expect(calls).toEqual(['logout-all', 'logout-all'])
  })
})
