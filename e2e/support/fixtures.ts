// fixtures.ts – `test` with API helpers, so test data is set up over HTTP instead of through the UI.
//
// Data isolation: tests never reset the database between tests. Instead each test creates its own tickets with a
// unique name (the `uniq` fixture, e2e-<runId>-<random>) and only asserts on those, so leftovers from earlier tests or
// runs can't interfere. Locally the database is wiped and reseeded once per run, when the backend starts; on staging
// nothing is ever reset, and global-teardown.staging.ts cleans up what the run made (by its e2e-<runId>- prefix).
import { test as base, expect, type APIRequestContext } from '@playwright/test'
import { API_URL, RUN_PREFIX, STAGING, TEST_EMAIL_DOMAIN } from './target'
import { account, type Role } from './users'

// Categories and priorities by name, as the backend lists them (GET /categories, /priorities). Their ids are
// looked up, not assumed: on staging they are whatever that database has.
export type CategoryName = 'Hardware' | 'Software' | 'Network' | 'Access' | 'Email' | 'Other'
export type PriorityName = 'Low' | 'Medium' | 'High' | 'Critical'

export type Ticket = { id: number; title: string; status: string }

// A logged-in role: its own request context (so its own cookie jar with tf_session) and the tf_csrf value to send
type Session = { http: APIRequestContext; csrf: string }

// What POST /users answers: with email set up, a link is emailed (password_delivery 'email'); without, a temporary
// password comes back once ('temporary_password')
type Created = { user: { id: number; email: string }; temporaryPassword?: string; password_delivery: string }

// Logs in on a request context and returns the tf_csrf value its cookie jar now has
export async function logIn(http: APIRequestContext, email: string, password: string, label: string) {
  const response = await http.post('auth/login', { data: { email, password } })
  expect(response, `login as ${label}`).toBeOK()
  const { cookies } = await http.storageState()
  const csrf = cookies.find((cookie) => cookie.name === 'tf_csrf')?.value
  expect(csrf, `tf_csrf cookie after logging in as ${label}`).toBeTruthy()
  return { response, csrf: csrf as string }
}

export class Api {
  private sessions = new Map<Role, Session>()
  private ids = new Map<string, number>()

  constructor(private readonly newContext: () => Promise<APIRequestContext>) {}

  // Logs in through the API once per role, like the browser does: the backend sets the session cookies in that
  // role's context, which sends them on every later request. Changes also need tf_csrf as the X-CSRF-Token header.
  async loginAs(role: Role): Promise<Session> {
    const cached = this.sessions.get(role)
    if (cached) return cached
    const http = await this.newContext()
    const { email, password } = account(role)
    const { csrf } = await logIn(http, email, password, role)
    const session = { http, csrf }
    this.sessions.set(role, session)
    return session
  }

  async dispose() {
    for (const { http } of this.sessions.values()) await http.dispose()
  }

  // Any API call as `as`; fails unless it's 2xx. Resolves to the JSON body (null for 204).
  async send(method: 'get' | 'post' | 'patch' | 'delete', url: string, as: Role, data?: unknown) {
    const { http, csrf } = await this.loginAs(as)
    const headers = method === 'get' ? {} : { 'X-CSRF-Token': csrf }
    const response = await http[method](url, { headers, data })
    expect(response, `${method.toUpperCase()} ${url} as ${as}`).toBeOK()
    return response.status() === 204 ? null : response.json()
  }

  // A GET as `as`, e.g. api.get('tickets?page=1', 'user'); fails the test unless it's 2xx
  get(url: string, as: Role = 'user') {
    return this.send('get', url, as)
  }

  // The id of an active category or priority, by name
  private async idOf(kind: 'categories' | 'priorities', name: string): Promise<number> {
    const key = `${kind}:${name}`
    if (!this.ids.has(key)) {
      const list: { id: number; name: string }[] = await this.send('get', kind, 'user')
      for (const item of list) this.ids.set(`${kind}:${item.name}`, item.id)
    }
    const id = this.ids.get(key)
    expect(id, `${kind} has "${name}"`).toBeDefined()
    return id as number
  }

  // Creates a ticket as `as` (default: the regular user)
  async createTicket({
    title,
    description = 'Created by an e2e test.',
    category = 'Hardware',
    priority = 'Medium',
    as = 'user',
  }: {
    title: string
    description?: string
    category?: CategoryName
    priority?: PriorityName
    as?: Role
  }): Promise<Ticket> {
    return this.send('post', 'tickets', as, {
      title,
      description,
      category_id: await this.idOf('categories', category),
      priority_id: await this.idOf('priorities', priority),
    })
  }

  // Creates an account as the admin (default role: employee). Doesn't set a password: see createReadyEmployee.
  createUser(name: string, email: string, role: 'employee' | 'agent' | 'hr' = 'employee'): Promise<Created> {
    return this.send('post', 'users', 'admin', { name, email, role })
  }

  // Creates an employee account as the admin; returns its email and the set-password link the backend emailed it.
  // Needs this run's mail folder, so local runs only (support/mail.ts).
  async createEmployee(name: string, email: string): Promise<{ email: string; link: string }> {
    const { user } = await this.createUser(name, email)
    const { setPasswordLink } = await import('./mail')
    return { email: user.email, link: await setPasswordLink(user.email) }
  }

  // Resets an account's password as the admin (POST users/:id/reset-password), which ends all of its sessions
  async resetPassword(email: string) {
    const users: { id: number; email: string }[] = await this.send('get', 'users', 'admin')
    const user = users.find((u) => u.email === email)
    expect(user, `user ${email} exists`).toBeTruthy()
    return this.send('post', `users/${user!.id}/reset-password`, 'admin')
  }

  // Creates an account (default: an employee) who can sign in straight away, with `password` as its own password, so
  // must_change_password is off and a login isn't sent to /set-password. Works in both of the backend's modes:
  //   email set up         the emailed set-password link is used through the API (POST auth/set-password); the link
  //                        is read from this run's mail folder, so this needs a local run
  //   temporary passwords  the temporary password signs in, then POST auth/change-password sets `password`
  // Returns the email and the password. Locally the run's database is dropped at the end; on staging the account is
  // deactivated by the teardown (its email starts with this run's prefix).
  async createReadyEmployee(
    name: string,
    email: string,
    password = 'ReadyPassword123',
    role: 'employee' | 'agent' | 'hr' = 'employee',
  ) {
    const created = await this.createUser(name, email, role)
    const http = await this.newContext()
    try {
      if (created.temporaryPassword) {
        const { csrf } = await logIn(http, created.user.email, created.temporaryPassword, `${email} (temporary)`)
        const changed = await http.post('auth/change-password', {
          headers: { 'X-CSRF-Token': csrf },
          data: { currentPassword: created.temporaryPassword, newPassword: password },
        })
        expect(changed, `replace the temporary password of ${email}`).toBeOK()
      } else {
        if (STAGING) {
          throw new Error(
            'Staging emails set-password links, which this run cannot read: an account with a password needs email off on staging (temporary passwords) or a mail catcher',
          )
        }
        const { setPasswordLink } = await import('./mail')
        const token = new URL(await setPasswordLink(created.user.email)).searchParams.get('token')
        const set = await http.post('auth/set-password', { data: { new_password: password, token } })
        expect(set, `set own password for ${email}`).toBeOK()
      }
      const { response } = await logIn(http, created.user.email, password, email)
      expect((await response.json()).user, 'must_change_password is off').toMatchObject({ must_change_password: false })
    } finally {
      await http.dispose()
    }
    return { email: created.user.email, password }
  }

  // Changes a ticket's status as staff (employees may only close/reopen)
  setStatus(
    id: number,
    status: string,
    { resolution, as = 'agent' }: { resolution?: string; as?: Role } = {},
  ): Promise<Ticket> {
    return this.send('patch', `tickets/${id}/status`, as, { status, resolution })
  }
}

export const test = base.extend<{ api: Api; uniq: string; testEmail: (label?: string) => string }>({
  api: async ({ playwright }, use) => {
    const api = new Api(() => playwright.request.newContext({ baseURL: `${API_URL}/` }))
    await use(api)
    await api.dispose()
  },

  // A name unique to this test and run, e.g. "e2e-lq3k9z-4f2a"; prefix test data with it and search for it
  uniq: async ({}, use) => {
    await use(`${RUN_PREFIX}${Math.random().toString(36).slice(2, 6)}`)
  },

  // An email address for a test account: unique, starting with the run's prefix (so the staging cleanup finds it), and
  // on the reserved .test domain, so no mail ever reaches anyone. testEmail('hr') → e2e-lq3k9z-4f2a.hr@example.test
  testEmail: async ({ uniq }, use) => {
    await use((label = '') => `${uniq}${label ? `.${label}` : ''}@${TEST_EMAIL_DOMAIN}`)
  },
})

export { expect }
