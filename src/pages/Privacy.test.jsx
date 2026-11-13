// Privacy.test.jsx – /privacy for everyone, logged in or not: what's stored, why, who sees it, how long, how to ask;
// company-specific parts marked; reached from the login page and from the footer of every signed-in page.
import { screen, within } from '@testing-library/react'
import App from '../App'
import { buildUser } from '../test/factories'
import { renderWithProviders } from '../test/render'
import Login from './Login'
import Privacy from './Privacy'

const renderApp = (route, user = null) => renderWithProviders(<App />, { route, path: '/*', user })

describe('Privacy page', () => {
  it('is open without logging in, with every section and a way back to sign in', async () => {
    await renderApp('/privacy')

    expect(screen.getByRole('heading', { level: 1, name: 'Privacy' })).toBeInTheDocument()
    for (const name of [
      'What we store',
      'Why',
      'Who can see it',
      'How long we keep it',
      'Seeing or correcting your data',
    ]) {
      expect(screen.getByRole('heading', { level: 2, name })).toBeInTheDocument()
    }
    expect(screen.getByRole('link', { name: 'Back to sign in' })).toHaveAttribute('href', '/login')
  })

  it('names every kind of personal data it keeps', async () => {
    await renderApp('/privacy')
    const what = screen.getByRole('region', { name: 'What we store' })

    for (const term of [
      'Your account',
      'Your tickets',
      'Comments',
      'Attachments',
      'Ratings',
      'Sign-ins',
      'Audit log',
    ]) {
      expect(within(what).getByText(term, { selector: 'dt' })).toBeInTheDocument()
    }
    for (const word of [/name, work email, department, job title and role/, /IP address/, /last signed in/]) {
      expect(within(what).getAllByText(word).length).toBeGreaterThan(0)
    }
  })

  it('says who sees what, by role', async () => {
    await renderApp('/privacy')
    const who = screen.getByRole('region', { name: 'Who can see it' })

    for (const role of ['You', 'IT staff', 'HR', 'Admins']) {
      expect(within(who).getByText(role, { selector: 'dt' })).toBeInTheDocument()
    }
    expect(within(who).getByText(/You never see internal notes/)).toBeInTheDocument()
    expect(within(who).getByText(/audit log \(sign-ins and IP addresses\)/)).toBeInTheDocument()
  })

  it('gives how long data is kept, and whom to ask to see or correct it', async () => {
    await renderApp('/privacy')

    const howLong = screen.getByRole('region', { name: 'How long we keep it' })
    expect(within(howLong).getByText(/Deleted 7 days after they end/)).toBeInTheDocument()
    expect(within(howLong).getAllByText('Kept until an admin removes them.').length).toBe(1)
    expect(within(howLong).getByText('Kept until an admin removes it.')).toBeInTheDocument()
    const rights = screen.getByRole('region', { name: 'Seeing or correcting your data' })
    expect(within(rights).getByText(/contact your HR or IT admin/)).toBeInTheDocument()
  })

  it('marks the parts only the company can fill in', async () => {
    await renderApp('/privacy')

    const todos = screen.getAllByText(/^\[to be completed by your company/)
    expect(todos.length).toBeGreaterThanOrEqual(5)
    expect(screen.getByText('[to be completed by your company: company name and address]')).toBeInTheDocument()
  })

  it('is linked from the login page', async () => {
    // The real login page (renderWithProviders' stub routes would otherwise answer /login)
    const routes = [
      { path: '/login', element: <Login /> },
      { path: '/privacy', element: <Privacy /> },
    ]
    const { user, router } = await renderWithProviders(null, { route: '/login', routes })
    await screen.findByRole('button', { name: 'Sign in' })

    await user.click(screen.getByRole('link', { name: 'Privacy' }))

    expect(router.state.location.pathname).toBe('/privacy')
    expect(screen.getByRole('heading', { level: 1, name: 'Privacy' })).toBeInTheDocument()
  })

  it('is linked from the footer of a signed-in page, and then leads back to the app', async () => {
    const { user, router } = await renderApp('/profile', buildUser())
    await screen.findByRole('heading', { name: 'My profile' })

    await user.click(within(screen.getByRole('contentinfo')).getByRole('link', { name: 'Privacy' }))

    expect(router.state.location.pathname).toBe('/privacy')
    expect(screen.getByRole('link', { name: 'Back to TicketFlow' })).toHaveAttribute('href', '/tickets')
  })
})
