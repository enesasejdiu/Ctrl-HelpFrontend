// render.jsx – renderWithProviders(): renders a component inside the same providers as main.jsx
// (AuthProvider + a router), with an in-memory router so tests can start on any URL and read where they ended up.
/* oxlint-disable react/only-export-components -- test helpers, not a fast-refresh module */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, useParams } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { AuthProvider, CHECKING_SESSION_LABEL } from '../context/AuthContext'
import { session } from './server'

// Starts a session the way a real login does: the mock backend now answers GET /auth/me with this user
// (in the browser that's the httpOnly cookie; the app itself never stores anything)
export function seedSession(user) {
  session.user = user
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

// Resolves once AuthProvider's startup session check (GET /auth/me) has answered and the app is rendered
export async function sessionChecked() {
  await waitFor(() => expect(screen.queryByText(CHECKING_SESSION_LABEL)).not.toBeInTheDocument())
}

/**
 * Async: resolves after the startup session check, so the page is rendered when it returns.
 * @param ui       element to render at `path` (ignored when `routes` is given)
 * @param options.route       starting URL, or a location object like { pathname, search, state }
 * @param options.path        route pattern `ui` is mounted at (default: the pathname of `route`)
 * @param options.user        log this user in before rendering (the mock backend's session, like a real login)
 * @param options.routes      a full route tree instead of `ui` + stub pages
 * @param options.userEventOptions  passed to userEvent.setup() (e.g. { advanceTimers } for fake timers)
 * @param options.waitForSession    false: return right away, while the session check is still running
 * @returns render() result plus `user` (userEvent instance) and `router` (read router.state.location)
 */
export async function renderWithProviders(
  ui,
  { route = '/', path, user = null, routes, userEventOptions, waitForSession = true } = {},
) {
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
  if (waitForSession) await sessionChecked()
  return { ...result, user: events, router }
}

// The current URL's query params, for asserting filter state
export function currentParams(router) {
  return Object.fromEntries(new URLSearchParams(router.state.location.search))
}
