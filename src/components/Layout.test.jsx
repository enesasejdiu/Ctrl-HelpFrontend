// Layout.test.jsx – the top bar per role: which navigation links each role gets, the profile link and Log out.
// HR is not staff (for tickets HR is an employee), but manages users and departments.
import { screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import App from '../App'
import { buildUser } from '../test/factories'
import { renderWithProviders } from '../test/render'
import { API, server } from '../test/server'

async function renderApp(user, route = '/tickets') {
  return renderWithProviders(null, { route, routes: [{ path: '*', element: <App /> }], user })
}

async function navLinks() {
  const nav = await screen.findByRole('navigation', { name: 'Main' })
  return within(nav)
    .getAllByRole('link')
    .map((link) => link.textContent)
}

describe('Layout top bar', () => {
  beforeEach(() => {
    server.use(
      http.get(`${API}/tickets`, () => HttpResponse.json([])),
      http.get(`${API}/users`, () => HttpResponse.json([])),
    )
  })

  it.each([
    ['employee', ['Tickets', 'New ticket']],
    ['agent', ['Tickets', 'New ticket']],
    ['hr', ['Tickets', 'New ticket', 'Users', 'Departments']],
    ['admin', ['Tickets', 'New ticket', 'Dashboard', 'Users', 'Departments']],
  ])('%s gets these navigation links', async (role, links) => {
    await renderApp(buildUser({ role }))
    expect(await navLinks()).toEqual(links)
  })

  it('HR: no Dashboard link, plus the profile link and Log out', async () => {
    await renderApp(buildUser({ role: 'hr', name: 'Hana Rexhepi' }))

    const nav = await screen.findByRole('navigation', { name: 'Main' })
    expect(within(nav).queryByRole('link', { name: 'Dashboard' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'My profile (Hana Rexhepi)' })).toHaveAttribute('href', '/profile')
    expect(screen.getByRole('button', { name: 'Log out' })).toBeInTheDocument()
    expect(screen.getByText('HR', { selector: '.role-tag' })).toBeInTheDocument()
  })

  it.each(['/admin/users', '/admin/departments'])('HR can open %s', async (route) => {
    const { router } = await renderApp(buildUser({ role: 'hr' }), route)
    await screen.findByRole('navigation', { name: 'Main' })
    expect(router.state.location.pathname).toBe(route)
  })

  it('HR is sent away from /admin (Dashboard) to the ticket list', async () => {
    const { router } = await renderApp(buildUser({ role: 'hr' }), '/admin')
    expect(await screen.findByRole('heading', { name: 'My tickets' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/tickets')
  })
})
