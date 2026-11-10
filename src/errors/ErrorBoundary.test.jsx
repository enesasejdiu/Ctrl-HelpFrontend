// ErrorBoundary.test.jsx – the error screens: where crashes are caught (page vs whole app), what the fallback shows and
// does, what gets logged, errors outside rendering, and chunk load errors after a deploy.
// The real app uses the dev-only /__crash pages (tests run as a development build).
// The whole app is mounted like main.jsx does: the same route objects (router.jsx) on a data router. The smaller trees
// use <MemoryRouter>, to test the boundaries without React Router's own error handling in the way.
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { Link, MemoryRouter, Outlet, Route, Routes, createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { appRoutes } from '../router'
import { buildUser } from '../test/factories'
import { seedSession, sessionChecked } from '../test/render'
import { API, server } from '../test/server'
import { browser } from '../utils/browser'
import AppErrorBoundary from './AppErrorBoundary'
import { CHUNK_RELOAD_KEY } from './chunkReload'
import ErrorFallback from './ErrorFallback'
import { errorLog } from './logger'
import RethrowRouteError from './RethrowRouteError'
import RouteErrorBoundary from './RouteErrorBoundary'

const TITLE = 'Something went wrong'
const TEXT = 'An unexpected error occurred. You can try again, or go back to the home page.'

let send, reload, assign
beforeEach(() => {
  send = vi.spyOn(errorLog, 'send').mockImplementation(() => {})
  reload = vi.spyOn(browser, 'reload').mockImplementation(() => {})
  assign = vi.spyOn(browser, 'assign').mockImplementation(() => {})
  server.use(
    http.get(`${API}/tickets`, () => HttpResponse.json([])),
    http.get(`${API}/users`, () => HttpResponse.json([])),
  )
})
afterEach(() => vi.unstubAllEnvs())

// React logs every error a boundary catches; the boundaries log it themselves (as main.jsx sets up), so that's off
const renderQuietly = (ui) => render(ui, { onCaughtError: () => {} })

// The whole app as main.jsx mounts it, on an in-memory data router; path() reads the current URL's path
async function renderApp(route, user = buildUser({ id: 7, role: 'admin' })) {
  seedSession(user)
  const router = createMemoryRouter(appRoutes, { initialEntries: [route] })
  const events = userEvent.setup()
  const { unmount } = renderQuietly(
    <AppErrorBoundary>
      <RouterProvider router={router} />
    </AppErrorBoundary>,
  )
  await sessionChecked()
  return { user: events, path: () => router.state.location.pathname, unmount }
}

// pages: { '/path': element }, all inside `layout` (which renders an <Outlet />)
function renderRoutes(layout, pages, route) {
  return renderQuietly(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route element={layout}>
          {Object.entries(pages).map(([path, element]) => (
            <Route key={path} path={path} element={element} />
          ))}
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

// The one error report sent so far
function lastReport() {
  expect(send).toHaveBeenCalled()
  return send.mock.calls.at(-1)[0]
}

describe('a page that crashes (route-level boundary)', () => {
  it('shows the fallback in place of the page, keeps the top bar usable, and focuses the heading', async () => {
    const { user, path } = await renderApp('/__crash')

    const alert = await screen.findByRole('alert')
    const heading = within(alert).getByRole('heading', { name: TITLE })
    // Focus moves in an effect right after the fallback appears
    await waitFor(() => expect(heading).toHaveFocus())
    expect(within(alert).getByText(TEXT)).toBeInTheDocument()
    expect(within(alert).getByRole('button', { name: 'Try again' })).toBeInTheDocument()
    // Only the full-page fallback offers a reload
    expect(within(alert).queryByRole('button', { name: 'Reload page' })).not.toBeInTheDocument()

    // Navigating elsewhere works, and the error doesn't follow
    const nav = screen.getByRole('navigation', { name: 'Main' })
    await user.click(within(nav).getByRole('link', { name: 'Users' }))
    expect(path()).toBe('/admin/users')
    expect(await screen.findByRole('heading', { level: 1, name: 'Users' })).toBeInTheDocument()
    expect(screen.queryByText(TITLE)).not.toBeInTheDocument()
  })

  it('logs the error, component stack, route, user id and the reference ID shown', async () => {
    await renderApp('/__crash')
    const alert = await screen.findByRole('alert')

    const report = lastReport()
    expect(report).toMatchObject({
      kind: 'render-route',
      name: 'Error',
      message: 'Test crash from /__crash (render)',
      route: '/__crash',
      userId: 7,
    })
    expect(report.componentStack).toContain('DevCrash')
    // Sentry's event ID format; the reference on screen is its start
    expect(report.eventId).toMatch(/^[0-9a-f]{32}$/)
    expect(report.referenceId).toBe(report.eventId.slice(0, 8).toUpperCase())
    expect(within(alert).getByText(report.referenceId)).toBeInTheDocument()
    expect(within(alert).getByText(/Error reference:/)).toBeInTheDocument()
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('"Go to home page" navigates to / (which opens the ticket list)', async () => {
    const { user, path } = await renderApp('/__crash')
    await user.click(await screen.findByRole('button', { name: 'Go to home page' }))
    expect(path()).toBe('/tickets')
    expect(await screen.findByRole('heading', { name: 'All tickets' })).toBeInTheDocument()
    expect(screen.queryByText(TITLE)).not.toBeInTheDocument()
    expect(assign).not.toHaveBeenCalled()
  })

  it('"Try again" renders the page again, and it shows if the problem was temporary', async () => {
    let broken = true
    function Flaky() {
      if (broken) throw new Error('temporary')
      return <h1>Page content</h1>
    }
    const user = userEvent.setup()
    renderRoutes(
      <RouteErrorBoundary>
        <Outlet />
      </RouteErrorBoundary>,
      { '/page': <Flaky /> },
      '/page',
    )

    await user.click(await screen.findByRole('button', { name: 'Try again' }))
    expect(await screen.findByText(TITLE)).toBeInTheDocument() // still broken: the fallback again
    broken = false
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(screen.getByRole('heading', { name: 'Page content' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('any navigation clears the error, even back to the same page', async () => {
    let broken = true
    function Flaky() {
      if (broken) throw new Error('temporary')
      return <h1>Page content</h1>
    }
    const user = userEvent.setup()
    renderRoutes(
      <>
        <Link to="/page">Same page</Link>
        <RouteErrorBoundary>
          <Outlet />
        </RouteErrorBoundary>
      </>,
      { '/page': <Flaky /> },
      '/page',
    )
    await screen.findByText(TITLE)

    broken = false
    await user.click(screen.getByRole('link', { name: 'Same page' }))
    expect(screen.getByRole('heading', { name: 'Page content' })).toBeInTheDocument()
  })
})

describe('a crash outside the pages (app-level boundary)', () => {
  it('a page outside the layout: the full-page fallback, with full page loads for home and reload', async () => {
    const user = userEvent.setup()
    await renderApp('/__crash/app')

    const alert = await screen.findByRole('alert')
    await waitFor(() => expect(within(alert).getByRole('heading', { name: TITLE })).toHaveFocus())
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
    expect(lastReport()).toMatchObject({ kind: 'render-app', message: 'Test crash from /__crash (app)' })
    // The data router's own error page never gets the chance
    expect(screen.queryByText(/Unexpected Application Error/)).not.toBeInTheDocument()
    expect(send).toHaveBeenCalledTimes(1)

    await user.click(within(alert).getByRole('button', { name: 'Go to home page' }))
    expect(assign).toHaveBeenCalledWith('/')
    await user.click(within(alert).getByRole('button', { name: 'Reload page' }))
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('an error in a layout is caught by the app-level boundary (the route-level one sits inside the layout)', async () => {
    function BrokenLayout() {
      throw new Error('layout broke')
    }
    renderQuietly(
      <AppErrorBoundary>
        <MemoryRouter>
          <Routes>
            <Route element={<BrokenLayout />}>
              <Route path="/" element={<p>Page</p>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </AppErrorBoundary>,
    )
    expect(await screen.findByRole('button', { name: 'Reload page' })).toBeInTheDocument()
    expect(lastReport()).toMatchObject({ kind: 'render-app', message: 'layout broke' })
  })

  it('anything that still reaches React Router is passed on to the app-level boundary, not its default page', async () => {
    function Broken() {
      throw new Error('past the inner boundary')
    }
    // A root route without PageErrorBoundary in its element: React Router's own boundary catches first
    const router = createMemoryRouter([{ path: '*', element: <Broken />, ErrorBoundary: RethrowRouteError }])
    renderQuietly(
      <AppErrorBoundary>
        <RouterProvider router={router} />
      </AppErrorBoundary>,
    )
    expect(await screen.findByRole('button', { name: 'Reload page' })).toBeInTheDocument()
    expect(screen.queryByText(/Unexpected Application Error/)).not.toBeInTheDocument()
    expect(lastReport()).toMatchObject({ kind: 'render-app', message: 'past the inner boundary' })
  })

  it('"Try again" re-renders the whole app', async () => {
    let broken = true
    function Root() {
      if (broken) throw new Error('temporary')
      return <h1>App content</h1>
    }
    const user = userEvent.setup()
    renderQuietly(
      <AppErrorBoundary>
        <Root />
      </AppErrorBoundary>,
    )
    broken = false
    await user.click(await screen.findByRole('button', { name: 'Try again' }))
    expect(screen.getByRole('heading', { name: 'App content' })).toBeInTheDocument()
  })

  it('renders without the router, the auth provider or anything else around it', async () => {
    function Broken() {
      throw new Error('no providers')
    }
    renderQuietly(
      <AppErrorBoundary>
        <Broken />
      </AppErrorBoundary>,
    )
    expect(await screen.findByRole('heading', { name: TITLE })).toBeInTheDocument()
  })
})

describe('what the fallback reveals', () => {
  function Broken() {
    throw new Error('secret internals: SELECT * FROM users')
  }
  const renderBroken = () =>
    renderQuietly(
      <AppErrorBoundary>
        <Broken />
      </AppErrorBoundary>,
    )

  it('production: no error message, stack or component stack, only the reference ID', async () => {
    vi.stubEnv('DEV', false)
    renderBroken()
    await screen.findByRole('heading', { name: TITLE })
    const text = document.body.textContent
    expect(text).not.toMatch(/secret internals|SELECT|Broken|at \w/)
    expect(document.querySelector('details, pre')).toBeNull()
    expect(screen.getByText(lastReport().referenceId)).toBeInTheDocument()
  })

  it('development: the message, stack and component stack, in a collapsible section', async () => {
    const user = userEvent.setup()
    renderBroken()
    const summary = await screen.findByText('Error details (development only)')
    const details = summary.closest('details')
    expect(details).not.toHaveAttribute('open')
    await user.click(summary)
    expect(details).toHaveAttribute('open')
    expect(details).toHaveTextContent('Error: secret internals: SELECT * FROM users')
    expect(details).toHaveTextContent(/Component stack:\s*at Broken/)
  })

  it('the buttons work from the keyboard', async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()
    const onHome = vi.fn()
    render(<ErrorFallback referenceId="ABCD1234" onRetry={onRetry} onHome={onHome} showDetails={false} />)
    await user.tab()
    expect(screen.getByRole('button', { name: 'Try again' })).toHaveFocus()
    await user.keyboard('{Enter}')
    await user.tab()
    await user.keyboard(' ')
    expect(onRetry).toHaveBeenCalledTimes(1)
    expect(onHome).toHaveBeenCalledTimes(1)
  })
})

describe('errors outside rendering', () => {
  function renderContent() {
    renderQuietly(
      <AppErrorBoundary>
        <h1>App content</h1>
      </AppErrorBoundary>,
    )
  }
  // jsdom has no PromiseRejectionEvent
  const rejection = (reason) => Object.assign(new Event('unhandledrejection'), { reason })

  it('an unhandled promise rejection is logged and leaves the page alone', () => {
    renderContent()
    act(() => window.dispatchEvent(rejection(new Error('Request failed with status code 500'))))
    expect(lastReport()).toMatchObject({
      kind: 'unhandled-rejection',
      message: 'Request failed with status code 500',
    })
    expect(screen.getByRole('heading', { name: 'App content' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('an uncaught error (e.g. in an event handler) is logged and leaves the page alone', () => {
    renderContent()
    act(() => window.dispatchEvent(new ErrorEvent('error', { error: new TypeError('handler broke') })))
    expect(lastReport()).toMatchObject({ kind: 'window-error', name: 'TypeError', message: 'handler broke' })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('stops listening when unmounted', () => {
    const { unmount } = render(
      <AppErrorBoundary>
        <h1>App content</h1>
      </AppErrorBoundary>,
    )
    unmount()
    window.dispatchEvent(rejection(new Error('after unmount')))
    expect(send).not.toHaveBeenCalled()
  })
})

describe('chunk load errors after a deploy', () => {
  const chunkError = () => new TypeError('Failed to fetch dynamically imported module: /assets/Admin-1a2b.js')

  it('a page whose code fails to load reloads once; failing again within the window shows the fallback', async () => {
    const first = await renderApp('/__crash/chunk')
    expect(await screen.findByText('Loading the latest version…')).toHaveAttribute('role', 'status')
    expect(reload).toHaveBeenCalledTimes(1)
    expect(Number(sessionStorage.getItem(CHUNK_RELOAD_KEY))).toBeGreaterThan(0)
    expect(lastReport()).toMatchObject({ kind: 'chunk-reload', route: '/__crash/chunk' })

    // "After the reload": the same thing happens again, with the flag still in sessionStorage
    first.unmount()
    await renderApp('/__crash/chunk')
    expect(await screen.findByRole('heading', { name: TITLE })).toBeInTheDocument()
    expect(reload).toHaveBeenCalledTimes(1) // no second reload: no loop
    expect(lastReport()).toMatchObject({ kind: 'render-route' })
  })

  it('a failed dynamic import outside rendering: one reload, then the full-page fallback', () => {
    renderQuietly(
      <AppErrorBoundary>
        <h1>App content</h1>
      </AppErrorBoundary>,
    )
    const rejection = () => Object.assign(new Event('unhandledrejection'), { reason: chunkError() })

    act(() => window.dispatchEvent(rejection()))
    expect(reload).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('heading', { name: 'App content' })).toBeInTheDocument()

    act(() => window.dispatchEvent(rejection()))
    expect(reload).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('heading', { name: TITLE })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reload page' })).toBeInTheDocument()
  })

  it('an ordinary render error never reloads the page', async () => {
    await renderApp('/__crash')
    await screen.findByRole('heading', { name: TITLE })
    expect(reload).not.toHaveBeenCalled()
    expect(sessionStorage.getItem(CHUNK_RELOAD_KEY)).toBeNull()
  })
})
