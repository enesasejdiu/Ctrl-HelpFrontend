// global-teardown.staging.ts – after a staging run, also when tests failed: cleans up what this run made, found by its
// e2e-<runId>- prefix, as far as the API allows, and writes what is left to test-results/staging-cleanup.json.
//   attachments on this run's tickets   deleted (DELETE /attachments/:id)
//   this run's tickets                  closed (the API can't delete tickets)
//   this run's accounts                 deactivated (the API can't delete users), so nobody can sign in with them
//   this run's departments              deleted, unless someone is still in one (the API refuses that)
//   this run's help categories          deleted, with their articles (kb.spec.ts deletes its own; this catches leftovers)
// Comments stay with their (closed) tickets. Nothing goes to staging's database directly.
import { request } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { Api } from './support/fixtures'
import { API_URL, RUN_PREFIX, STAGING_ACCOUNTS_FILE } from './support/target'

type Row = { id: number; title?: string; name?: string; email?: string; status?: string; is_active?: boolean }

export default async function globalTeardown() {
  const api = new Api(() => request.newContext({ baseURL: `${API_URL}/` }))
  const left: string[] = []
  const done = {
    attachmentsDeleted: 0,
    ticketsClosed: 0,
    usersDeactivated: 0,
    departmentsDeleted: 0,
    kbArticlesDeleted: 0,
    kbCategoriesDeleted: 0,
  }
  const attempt = async (what: string, action: () => Promise<unknown>) => {
    try {
      await action()
      return true
    } catch (err) {
      left.push(`${what}: ${(err as Error).message.split('\n')[0]}`)
      return false
    }
  }

  try {
    const tickets: Row[] = await api.get(`tickets?q=${encodeURIComponent(RUN_PREFIX)}`, 'admin')
    for (const ticket of tickets.filter((t) => t.title?.startsWith(RUN_PREFIX))) {
      const files: Row[] = await api.get(`tickets/${ticket.id}/attachments`, 'admin')
      for (const file of files) {
        if (await attempt(`attachment ${file.id}`, () => api.send('delete', `attachments/${file.id}`, 'admin'))) {
          done.attachmentsDeleted += 1
        }
      }
      if (ticket.status !== 'closed') {
        const closed = await attempt(`ticket ${ticket.id} (${ticket.title})`, () =>
          api.setStatus(ticket.id, 'closed', { resolution: 'Closed by the e2e run cleanup', as: 'admin' }),
        )
        if (closed) done.ticketsClosed += 1
      }
    }

    // The admin's own account is never touched, even if it happened to match
    const users: Row[] = await api.get('users', 'admin')
    const ours = users.filter((u) => u.email?.startsWith(RUN_PREFIX) && u.is_active !== false)
    // Also out of any department, so the run's departments below are empty and can be deleted
    for (const user of ours) {
      const off = await attempt(`user ${user.email}`, () =>
        api.send('patch', `users/${user.id}`, 'admin', { is_active: false, department_id: null }),
      )
      if (off) done.usersDeactivated += 1
    }

    // Departments a test made (named with the prefix) and didn't delete itself, e.g. because it failed half-way
    const departments: Row[] = await api.get('departments', 'admin')
    for (const department of departments.filter((d) => d.name?.startsWith(RUN_PREFIX))) {
      const gone = await attempt(`department ${department.name}`, () =>
        api.send('delete', `departments/${department.id}`, 'admin'),
      )
      if (gone) done.departmentsDeleted += 1
    }

    // Knowledge-base categories a test made (named with the prefix), with their articles (drafts too: staff get every
    // status when none is asked for), e.g. when kb.spec.ts failed before its own cleanup
    const kbCategories: (Row & { slug: string })[] = await api.get('kb/categories', 'admin')
    for (const category of kbCategories.filter((c) => c.name?.startsWith(RUN_PREFIX))) {
      const articles: Row[] = await api.get(`kb/articles?category=${encodeURIComponent(category.slug)}`, 'admin')
      for (const article of articles) {
        const gone = await attempt(`article ${article.title}`, () =>
          api.send('delete', `kb/articles/${article.id}`, 'admin'),
        )
        if (gone) done.kbArticlesDeleted += 1
      }
      const gone = await attempt(`help category ${category.name}`, () =>
        api.send('delete', `kb/categories/${category.id}`, 'admin'),
      )
      if (gone) done.kbCategoriesDeleted += 1
    }
  } catch (err) {
    left.push(`cleanup stopped: ${(err as Error).message.split('\n')[0]}`)
  } finally {
    await api.dispose()
    if (STAGING_ACCOUNTS_FILE) fs.rmSync(STAGING_ACCOUNTS_FILE, { force: true })
  }

  const report = {
    prefix: RUN_PREFIX,
    ...done,
    remaining: 'closed tickets (with their comments) and deactivated accounts stay: the API has no delete for them',
    problems: left,
  }
  fs.mkdirSync('test-results', { recursive: true })
  fs.writeFileSync(path.join('test-results', 'staging-cleanup.json'), JSON.stringify(report, null, 2))
  console.log(
    `[e2e:staging] cleanup ${RUN_PREFIX}: ${done.attachmentsDeleted} attachments deleted, ${done.ticketsClosed} tickets closed, ${done.usersDeactivated} accounts deactivated, ${done.departmentsDeleted} departments deleted, ${done.kbArticlesDeleted} help articles and ${done.kbCategoriesDeleted} help categories deleted${left.length ? `; ${left.length} problem(s), see test-results/staging-cleanup.json` : ''}`,
  )
}
