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

export class Api {
  private tokens = new Map<Role, string>()

  constructor(private readonly http: APIRequestContext) {}

  // Logs in through the API (cached per role) and returns the token
  async loginAs(role: Role): Promise<string> {
    const cached = this.tokens.get(role)
    if (cached) return cached
    const response = await this.http.post('auth/login', { data: { email: USERS[role].email, password: PASSWORD } })
    expect(response, `login as ${role}`).toBeOK()
    const { token } = await response.json()
    this.tokens.set(role, token)
    return token
  }

  private async send(method: 'get' | 'post' | 'patch', url: string, as: Role, data?: unknown) {
    const headers = { Authorization: `Bearer ${await this.loginAs(as)}` }
    const response = await this.http[method](url, { headers, data })
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

  // Changes a ticket's status as staff (employees may only close/reopen)
  setStatus(id: number, status: string, { resolution, as = 'agent' }: { resolution?: string; as?: Role } = {}): Promise<Ticket> {
    return this.send('patch', `tickets/${id}/status`, as, { status, resolution })
  }
}

export const test = base.extend<{ api: Api; uniq: string }>({
  api: async ({ playwright }, use) => {
    const http = await playwright.request.newContext({ baseURL: `${API_URL}/` })
    await use(new Api(http))
    await http.dispose()
  },

  // A name unique to this test and run, e.g. "e2e-lq3k9z-4f2a"; prefix test data with it and search for it
  uniq: async ({}, use) => {
    await use(`e2e-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`)
  },
})

export { expect }
