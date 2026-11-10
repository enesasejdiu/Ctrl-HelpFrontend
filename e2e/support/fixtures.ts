// fixtures.ts – `test` with API helpers, so test data is set up over HTTP instead of through the UI.
//
// Data isolation: tests never reset the database between tests. Instead each test creates its own tickets with a
// unique name (the `uniq` fixture) and only asserts on those, so leftovers from earlier tests or runs can't
// interfere. The database is wiped and reseeded once per run, when the backend starts.
import { test as base, expect, type APIRequestContext } from '@playwright/test'
import { API_URL } from '../../scripts/e2e-env.mjs'
import { PASSWORD, USERS, type Role } from './users'

// Ids from the backend seed (categories and priorities are fixed reference data)
export const CATEGORY = { Hardware: 1, Software: 2, Network: 3, Access: 4, Email: 5, Other: 6 } as const
export const PRIORITY = { Low: 1, Medium: 2, High: 3, Critical: 4 } as const

export type Ticket = { id: number; title: string; status: string }

// A logged-in role: its own request context (so its own cookie jar with tf_session) and the tf_csrf value to send
type Session = { http: APIRequestContext; csrf: string }

export class Api {
  private sessions = new Map<Role, Session>()

  constructor(private readonly newContext: () => Promise<APIRequestContext>) {}

  // Logs in through the API once per role, like the browser does: the backend sets the session cookies in that
  // role's context, which sends them on every later request. Changes also need tf_csrf as the X-CSRF-Token header.
  async loginAs(role: Role): Promise<Session> {
    const cached = this.sessions.get(role)
    if (cached) return cached
    const http = await this.newContext()
    const response = await http.post('auth/login', { data: { email: USERS[role].email, password: PASSWORD } })
    expect(response, `login as ${role}`).toBeOK()
    const { cookies } = await http.storageState()
    const csrf = cookies.find((cookie) => cookie.name === 'tf_csrf')?.value
    expect(csrf, `tf_csrf cookie after logging in as ${role}`).toBeTruthy()
    const session = { http, csrf: csrf as string }
    this.sessions.set(role, session)
    return session
  }

  async dispose() {
    for (const { http } of this.sessions.values()) await http.dispose()
  }

  private async send(method: 'get' | 'post' | 'patch', url: string, as: Role, data?: unknown) {
    const { http, csrf } = await this.loginAs(as)
    const headers = method === 'get' ? {} : { 'X-CSRF-Token': csrf }
    const response = await http[method](url, { headers, data })
    expect(response, `${method.toUpperCase()} ${url} as ${as}`).toBeOK()
    return response.json()
  }

  // Creates a ticket as `as` (default: the regular user)
  createTicket({
    title,
    description = 'Created by an e2e test.',
    category = 'Hardware',
    priority = 'Medium',
    as = 'user',
  }: {
    title: string
    description?: string
    category?: keyof typeof CATEGORY
    priority?: keyof typeof PRIORITY
    as?: Role
  }): Promise<Ticket> {
    return this.send('post', 'tickets', as, {
      title,
      description,
      category_id: CATEGORY[category],
      priority_id: PRIORITY[priority],
    })
  }

  // Creates an employee account as the admin; returns its email and the one-time temporary password
  async createEmployee(name: string, email: string): Promise<{ email: string; password: string }> {
    const { user, temporaryPassword } = await this.send('post', 'users', 'admin', { name, email, role: 'employee' })
    return { email: user.email, password: temporaryPassword }
  }

  // Creates an employee who can sign in straight away: the account is made with a temporary password, which is then
  // replaced through the API (POST auth/change-password), so must_change_password is off and a login isn't sent to
  // /set-password. Returns the email and the password now in use. Nothing is deleted afterwards: each run's database
  // is dropped at the end, and the unique email keeps the account away from every other test.
  async createReadyEmployee(name: string, email: string, password = 'ReadyPassword123') {
    const account = await this.createEmployee(name, email)
    const http = await this.newContext()
    try {
      const login = await http.post('auth/login', { data: account })
      expect(login, `first login as ${account.email}`).toBeOK()
      const { cookies } = await http.storageState()
      const csrf = cookies.find((cookie) => cookie.name === 'tf_csrf')?.value ?? ''
      const change = await http.post('auth/change-password', {
        headers: { 'X-CSRF-Token': csrf },
        data: { currentPassword: account.password, newPassword: password },
      })
      expect(change, `set own password for ${account.email}`).toBeOK()
      const me = await http.get('auth/me')
      expect(await me.json(), 'must_change_password is off').toMatchObject({ must_change_password: false })
    } finally {
      await http.dispose()
    }
    return { email: account.email, password }
  }

  // Changes a ticket's status as staff (employees may only close/reopen)
  setStatus(id: number, status: string, { resolution, as = 'agent' }: { resolution?: string; as?: Role } = {}): Promise<Ticket> {
    return this.send('patch', `tickets/${id}/status`, as, { status, resolution })
  }
}

export const test = base.extend<{ api: Api; uniq: string }>({
  api: async ({ playwright }, use) => {
    const api = new Api(() => playwright.request.newContext({ baseURL: `${API_URL}/` }))
    await use(api)
    await api.dispose()
  },

  // A name unique to this test and run, e.g. "e2e-lq3k9z-4f2a"; prefix test data with it and search for it
  uniq: async ({}, use) => {
    await use(`e2e-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`)
  },
})

export { expect }
