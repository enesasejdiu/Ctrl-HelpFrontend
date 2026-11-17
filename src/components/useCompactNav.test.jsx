// useCompactNav.test.jsx – the top bar's icons-only mode (useCompactNav.js, Layout.jsx). jsdom does no layout, so a fake
// ResizeObserver reports and the nav's widths are set by hand: scrollWidth = what the links need, clientWidth = the
// space the bar leaves for them.
import { act, screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import App from '../App'
import { buildUser } from '../test/factories'
import { renderWithProviders } from '../test/render'
import { API, server } from '../test/server'

let observers = []
class FakeResizeObserver {
  constructor(callback) {
    this.callback = callback
    observers.push(this)
  }
  // The real one also reports once right after it starts observing; here every report is the test's resize(), after
  // it has set the widths, so nothing depends on timing
  observe(element) {
    this.element = element
  }
  disconnect() {
    observers = observers.filter((o) => o !== this)
  }
}

// The nav's widths: `needed` with labels (scrollWidth), `available` (clientWidth); icons only need `iconsOnly`
function setWidths(nav, { needed, available, iconsOnly = 360 }) {
  Object.defineProperty(nav, 'clientWidth', { configurable: true, get: () => available })
  Object.defineProperty(nav, 'scrollWidth', {
    configurable: true,
    get: () => (nav.classList.contains('topbar__nav--compact') ? iconsOnly : needed),
  })
}
const resize = () => act(async () => observers.forEach((o) => o.callback([])))

async function renderNav(role) {
  renderWithProviders(null, { route: '/tickets', routes: [{ path: '*', element: <App /> }], user: buildUser({ role }) })
  return screen.findByRole('navigation', { name: 'Main' })
}

beforeEach(() => {
  observers = []
  vi.stubGlobal('ResizeObserver', FakeResizeObserver)
  server.use(
    http.get(`${API}/tickets`, () => HttpResponse.json([])),
    http.get(`${API}/users`, () => HttpResponse.json([])),
  )
})
afterEach(() => vi.unstubAllGlobals())

describe('the top bar when the links do not fit', () => {
  it('labels when they fit', async () => {
    const nav = await renderNav('admin')
    setWidths(nav, { needed: 960, available: 1100 })
    await resize()
    expect(nav).not.toHaveClass('topbar__nav--compact')
    expect(within(nav).getByRole('link', { name: 'Settings' })).not.toHaveAttribute('title')
  })

  it('icons only when they do not fit; every link keeps its name (aria-label and tooltip) and stays a link', async () => {
    const nav = await renderNav('admin')
    setWidths(nav, { needed: 960, available: 700 })
    await resize()
    expect(nav).toHaveClass('topbar__nav--compact')
    const settings = within(nav).getByRole('link', { name: 'Settings' })
    expect(settings).toHaveAttribute('href', '/admin/settings')
    expect(settings).toHaveAttribute('title', 'Settings')
    expect(
      within(nav)
        .getAllByRole('link')
        .map((link) => link.getAttribute('aria-label')),
    ).toEqual(['Tickets', 'New ticket', 'Knowledge base', 'Dashboard', 'Users', 'Departments', 'Audit log', 'Settings'])
  })

  it('back to labels once the window is wide enough again (the width they need was remembered)', async () => {
    const nav = await renderNav('admin')
    setWidths(nav, { needed: 960, available: 700 })
    await resize()
    expect(nav).toHaveClass('topbar__nav--compact')
    setWidths(nav, { needed: 960, available: 980 })
    await resize()
    expect(nav).not.toHaveClass('topbar__nav--compact')
  })

  it('stays icons only while the space is still too small (no flicker between the two)', async () => {
    const nav = await renderNav('admin')
    setWidths(nav, { needed: 960, available: 700 })
    await resize()
    setWidths(nav, { needed: 960, available: 900 }) // icons fit (360), labels still don't (960)
    await resize()
    await resize()
    expect(nav).toHaveClass('topbar__nav--compact')
  })

  it('an employee with three links in the same space keeps the labels', async () => {
    const nav = await renderNav('employee')
    setWidths(nav, { needed: 420, available: 700 })
    await resize()
    expect(nav).not.toHaveClass('topbar__nav--compact')
    expect(within(nav).getByRole('link', { name: 'Knowledge base' })).not.toHaveAttribute('aria-label')
  })
})

describe('without ResizeObserver (very old browsers)', () => {
  it('always shows the labels', async () => {
    vi.stubGlobal('ResizeObserver', undefined)
    const nav = await renderNav('admin')
    expect(nav).not.toHaveClass('topbar__nav--compact')
    expect(within(nav).getByRole('link', { name: 'Settings' })).toHaveTextContent('Settings')
  })
})
