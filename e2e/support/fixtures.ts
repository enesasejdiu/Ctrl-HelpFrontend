// fixtures.ts – `test` with API helpers, so test data is set up over HTTP instead of through the UI.
//
// Data isolation: tests never reset the database between tests. Instead each test creates its own tickets with a
// unique name (the `uniq` fixture) and only asserts on those, so leftovers from earlier tests or runs can't
// interfere. The database is wiped and reseeded once per run, when the backend starts.
import { test as base, expect, type APIRequestContext } from '@playwright/test'
import { API_URL } from '../../scripts/e2e-env.mjs'
import { setPasswordLink } from './mail'
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

  // Creates an employee account as the admin; returns its email and the set-password link the backend emailed it
  // (read from this run's mail folder: no password is ever returned)
  async createEmployee(name: string, email: string): Promise<{ email: string; link: string }> {
    const { user } = await this.send('post', 'users', 'admin', { name, email, role: 'employee' })
    return { email: user.email, link: await setPasswordLink(user.email) }
  }

  // Resets an account's password as the admin (POST users/:id/reset-password), which ends all of its sessions
  async resetPassword(email: string) {
    const users: { id: number; email: string }[] = await this.send('get', 'users', 'admin')
    const user = users.find((u) => u.email === email)
    expect(user, `user ${email} exists`).toBeTruthy()
    return this.send('post', `users/${user!.id}/reset-password`, 'admin')
  }

  // Creates an employee who can sign in straight away: the account is made, and its password is set with the emailed
  // link through the API (POST auth/set-password), so must_change_password is off and a login isn't sent to
  // /set-password. Returns the email and the password. Nothing is deleted afterwards: each run's database is dropped
  // at the end, and the unique email keeps the account away from every other test.
  async createReadyEmployee(name: string, email: string, password = 'ReadyPassword123') {
    const account = await this.createEmployee(name, email)
    const linkToken = new URL(account.link).searchParams.get('token')
    const http = await this.newContext()
    try {
      const set = await http.post('auth/set-password', { data: { new_password: password, token: linkToken } })
      expect(set, `set own password for ${account.email}`).toBeOK()
      const login = await http.post('auth/login', { data: { email: account.email, password } })
      expect(login, `first login as ${account.email}`).toBeOK()
      expect((await login.json()).user, 'must_change_password is off').toMatchObject({ must_change_password: false })
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
