// NotFoundPage.test.jsx – "Page not found": for URLs no route matches (logged in or not, without hiding real routes or
// their guards), and in place of a ticket that doesn't exist. Plus the shown path, the buttons, the tab title and
// noindex, and the low-severity report to monitoring.
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { createBrowserRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import App from '../App'
import { logNotFound } from '../errors/logger'
import { appRoutes } from '../router'
import { buildTicket, buildUser } from '../test/factories'
import { renderWithProviders, seedSession, sessionChecked } from '../test/render'
import { API, server } from '../test/server'

vi.mock('../errors/logger', async (importOriginal) => ({ ...(await importOriginal()), logNotFound: vi.fn() }))

const TITLE = 'Page not found'
const TEXT = "The page you're looking for doesn't exist or may have been moved."

const employee = buildUser({ role: 'employee', name: 'Liridon Gashi' })
const admin = buildUser({ id: 1, role: 'admin', name: 'Admin User' })

beforeEach(() => {
  server.use(
    http.get(`${API}/tickets`, () => HttpResponse.json([])),
    http.get(`${API}/users`, () => HttpResponse.json([])),
    http.get(`${API}/users/agents`, () => HttpResponse.json([])),
    http.get(`${API}/stats`, () => HttpResponse.json({})),
  )
})

function renderApp(route, user = null) {
  return renderWithProviders(null, { route, routes: [{ path: '*', element: <App /> }], user })
}

const heading = () => screen.findByRole('heading', { level: 1, name: TITLE })
// Focus moves in an effect right after the heading appears, so wait for it rather than checking at once
async function focusedHeading() {
  const element = await heading()
  await waitFor(() => expect(element).toHaveFocus())
  return element
}
const shownPath = () => document.querySelector('.not-found__path code')?.textContent

describe('a URL that matches no route', () => {
  it('logged out: the page in the public frame, without a detour to /login', async () => {
    const { router } = await renderApp('/admin/usres')

    await focusedHeading()
    expect(screen.getByText(TEXT)).toBeInTheDocument()
    expect(screen.getByText("We couldn't find", { exact: false })).toHaveTextContent("We couldn't find /admin/usres")
    expect(router.state.location.pathname).toBe('/admin/usres')
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    // Home, for someone logged out, is the login page
    expect(screen.getByRole('link', { name: 'Go to home page' })).toHaveAttribute('href', '/login')
  })

  it('logged in: inside the normal layout; home is the ticket list', async () => {
    const { user, router } = await renderApp('/tickets/42/oops', employee)

    await heading()
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    await user.click(screen.getByRole('link', { name: 'Go to home page' }))
    expect(router.state.location.pathname).toBe('/tickets')
    expect(await screen.findByRole('heading', { name: 'My tickets' })).toBeInTheDocument()
  })

  it('a user who still has a temporary password goes to /set-password, as from every page', async () => {
    const { router } = await renderApp('/nope', buildUser({ role: 'employee', must_change_password: true }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/set-password'))
    expect(screen.queryByText(TITLE)).not.toBeInTheDocument()
  })

  it('the top bar works from it', async () => {
    const { user, router } = await renderApp('/nope', employee)
    await heading()
    await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', { name: 'New ticket' }))
    expect(router.state.location.pathname).toBe('/tickets/new')
    expect(screen.queryByText(TITLE)).not.toBeInTheDocument()
  })

  it('is reported to monitoring with the path only (no query string)', async () => {
    await renderApp('/nope?email=jane%40example.com', employee)
    await heading()
    expect(logNotFound).toHaveBeenCalledWith('/nope')
    expect(shownPath()).toBe('/nope')
  })
})

describe('real routes keep their guards and are never hidden', () => {
  it.each(['/tickets', '/tickets/new', '/tickets/7', '/profile', '/admin', '/admin/users', '/admin/departments'])(
    'logged out, %s still sends you to /login',
    async (route) => {
      const { router } = await renderApp(route)
      await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
      expect(screen.queryByText(TITLE)).not.toBeInTheDocument()
    },
  )

  it.each(['/admin', '/admin/users', '/admin/departments'])(
    'an employee opening %s is turned away as before (to the ticket list), not shown "not found"',
    async (route) => {
      const { router } = await renderApp(route, employee)
      await waitFor(() => expect(router.state.location.pathname).toBe('/tickets'))
      expect(screen.queryByText(TITLE)).not.toBeInTheDocument()
    },
  )

  it.each([
    ['/', 'All tickets'],
    ['/tickets', 'All tickets'],
    ['/tickets/new', 'New ticket'],
    ['/profile', 'My profile'],
    ['/admin/users', 'Users'],
    ['/admin/departments', 'Departments'],
  ])('logged in, %s opens its page', async (route, title) => {
    await renderApp(route, admin)
    expect(await screen.findByRole('heading', { level: 1, name: title })).toBeInTheDocument()
    expect(screen.queryByText(TITLE)).not.toBeInTheDocument()
  })

  it('a nested route with an id (/tickets/:id) opens the ticket', async () => {
    const ticket = buildTicket({ title: 'Printer jams' })
    server.use(
      http.get(`${API}/tickets/${ticket.id}`, () => HttpResponse.json({ ...ticket, comments: [], history: [] })),
    )
    await renderApp(`/tickets/${ticket.id}`, employee)
    expect(await screen.findByRole('heading', { name: /Printer jams/ })).toBeInTheDocument()
    expect(screen.queryByText(TITLE)).not.toBeInTheDocument()
    expect(logNotFound).not.toHaveBeenCalled()
  })
})

describe("a ticket that doesn't exist", () => {
  it('a 404 from the API: the not-found page in place, with its own message', async () => {
    const asked = vi.fn()
    server.use(
      http.get(`${API}/tickets/9999`, () => {
        asked()
        return HttpResponse.json({ message: 'Ticket not found' }, { status: 404 })
      }),
    )
    await renderApp('/tickets/9999', employee)

    await focusedHeading()
    expect(asked).toHaveBeenCalled() // the page asked, and the API said 404
    expect(screen.getByText("This ticket doesn't exist or has been removed.")).toBeInTheDocument()
    expect(screen.queryByText(TEXT)).not.toBeInTheDocument()
    expect(screen.queryByText('Loading ticket…')).not.toBeInTheDocument()
    expect(screen.queryByText('Ticket not found')).not.toBeInTheDocument() // no generic error box
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument()
    expect(shownPath()).toBe('/tickets/9999')
    // A missing record is normal app behaviour, not a broken link: not reported
    expect(logNotFound).not.toHaveBeenCalled()
  })

  it('an id that is not a number is not even requested', async () => {
    const requested = vi.fn()
    server.events.on('request:start', ({ request }) => requested(new URL(request.url).pathname))
    await renderApp('/tickets/abc', employee)
    expect(await screen.findByText("This ticket doesn't exist or has been removed.")).toBeInTheDocument()
    expect(requested).not.toHaveBeenCalledWith('/api/tickets/abc')
  })

  it('other API errors still show the error message as before (403, 500)', async () => {
    server.use(
      http.get(`${API}/tickets/5`, () =>
        HttpResponse.json({ message: 'You can only view your own tickets' }, { status: 403 }),
      ),
    )
    await renderApp('/tickets/5', employee)
    expect(await screen.findByRole('alert')).toHaveTextContent('You can only view your own tickets')
    expect(screen.queryByText(TITLE)).not.toBeInTheDocument()
  })
})

describe('what the page shows', () => {
  it('a path with markup is shown as text, decoded, and nothing in it runs', async () => {
    await renderApp('/%3Cscript%3Ealert(1)%3C%2Fscript%3E%3Cimg%20src%3Dx%20onerror%3Dalert(2)%3E')
    await heading()
    expect(shownPath()).toBe('/<script>alert(1)</script><img src=x onerror=alert(2)>')
    expect(document.querySelector('.not-found script, .not-found img')).toBeNull()
  })

  it('a long path is cut to 100 characters', async () => {
    await renderApp(`/${'a'.repeat(300)}`)
    await heading()
    expect(shownPath()).toBe(`/${'a'.repeat(98)}…`)
    expect(Array.from(shownPath())).toHaveLength(100)
  })

  it('sets the tab title and noindex while shown, and undoes both afterwards', async () => {
    document.title = 'TicketFlow'
    const { user } = await renderApp('/nope', employee)
    await heading()
    expect(document.title).toBe('Page not found – TicketFlow')
    expect(document.head.querySelectorAll('meta[name="robots"][content="noindex"]')).toHaveLength(1)

    await user.click(screen.getByRole('link', { name: 'Go to home page' }))
    await screen.findByRole('heading', { name: 'My tickets' })
    expect(document.title).toBe('TicketFlow')
    expect(document.head.querySelector('meta[name="robots"]')).toBeNull()
  })
})

describe('"Go back"', () => {
  // A browser router (like main.jsx), so the real window.history is used
  async function renderInBrowser(path) {
    window.history.replaceState(null, '', path)
    seedSession(employee)
    const router = createBrowserRouter(appRoutes)
    render(<RouterProvider router={router} />)
    await sessionChecked()
    return { router, user: userEvent.setup() }
  }
  afterEach(() => window.history.replaceState(null, '', '/'))

  it('is not offered when the not-found page is the first page of the visit (going back would leave the app)', async () => {
    const { router } = await renderInBrowser('/nope')
    await heading()
    expect(screen.queryByRole('button', { name: 'Go back' })).not.toBeInTheDocument()
    router.dispose()
  })

  it('goes back to the previous page of the app', async () => {
    const { router, user } = await renderInBrowser('/tickets')
    await screen.findByRole('heading', { name: 'My tickets' })
    await act(() => router.navigate('/nope'))
    await heading()

    await user.click(screen.getByRole('button', { name: 'Go back' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/tickets'))
    expect(await screen.findByRole('heading', { name: 'My tickets' })).toBeInTheDocument()
    router.dispose()
  })

  it('works from the keyboard', async () => {
    const { router, user } = await renderInBrowser('/tickets')
    await screen.findByRole('heading', { name: 'My tickets' })
    await act(() => router.navigate('/nope'))
    await focusedHeading()

    await user.tab()
    expect(screen.getByRole('link', { name: 'Go to home page' })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Go back' })).toHaveFocus()
    await user.keyboard('{Enter}')
    await waitFor(() => expect(router.state.location.pathname).toBe('/tickets'))
    router.dispose()
  })
})
