// render.jsx – renderWithProviders(): renders a component inside the same providers as main.jsx
// (AuthProvider + a router), with an in-memory router so tests can start on any URL and read where they ended up.
/* oxlint-disable react/only-export-components -- test helpers, not a fast-refresh module */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryRouter, useParams } from 'react-router-dom'
import { AuthProvider } from '../context/AuthContext'
import { setSessionUser } from './server'

// Logs a user in on the mock backend: GET /auth/me then answers with them, as it would for a real session cookie
export function seedSession(user) {
  setSessionUser(user)
}

function TicketPageStub() {
  const { id } = useParams()
  return <h1>Ticket {id}</h1>
}

// Placeholder pages for where components navigate to, so a test can assert the page that rendered
export const stubRoutes = [
  { path: '/login', element: <h1>Login page</h1> },
  { path: '/tickets', element: <h1>Tickets page</h1> },
  { path: '/tickets/:id', element: <TicketPageStub /> },
]

/**
 * @param ui       element to render at `path` (ignored when `routes` is given)
 * @param options.route       starting URL, or a location object like { pathname, search, state }
 * @param options.path        route pattern `ui` is mounted at (default: the pathname of `route`)
 * @param options.user        log this user in before rendering (the mock backend's session; see seedSession)
 * @param options.routes      a full route tree instead of `ui` + stub pages
 * @param options.userEventOptions  passed to userEvent.setup() (e.g. { advanceTimers } for fake timers)
 * @returns render() result plus `user` (userEvent instance) and `router` (read router.state.location)
 */
export function renderWithProviders(ui, { route = '/', path, user = null, routes, userEventOptions } = {}) {
  if (user) seedSession(user)

  const pathname = typeof route === 'string' ? route.split('?')[0] : route.pathname
  const uiPath = path ?? pathname
  const tree = routes ?? [{ path: uiPath, element: ui }, ...stubRoutes.filter((r) => r.path !== uiPath)]
  const router = createMemoryRouter(tree, { initialEntries: [route] })

  const events = userEvent.setup(userEventOptions)
  const result = render(
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>,
  )
  return { ...result, user: events, router }
}

// AuthProvider first asks the backend who is logged in (GET /auth/me) and shows "Checking your session…" until it
// answers. Await this before looking for the page.
export async function waitForSessionCheck() {
  await waitFor(() => expect(screen.queryByText('Checking your session…')).not.toBeInTheDocument())
}

// renderWithProviders() that resolves once the session check is done and the page is on screen
export async function renderReady(ui, options) {
  const result = renderWithProviders(ui, options)
  await waitForSessionCheck()
  return result
}

// The current URL's query params, for asserting filter state
export function currentParams(router) {
  return Object.fromEntries(new URLSearchParams(router.state.location.search))
}
