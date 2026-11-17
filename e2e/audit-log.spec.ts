// audit-log.spec.ts – the audit log page against the real backend: an admin changes a user's role on the Users page,
// and the change is the newest entry in the audit log, with a readable label and summary.
import { expect, test } from './support/fixtures'
import { authFile } from './support/users'

test.use({ storageState: authFile('admin') })

test('an admin changes a role, then sees "Role changed" at the top of the audit log', async ({ page, api, uniq }) => {
  const name = `Audit Person ${uniq}`
  await api.createUser(name, `${uniq}@example.test`)

  await page.goto('/admin/users')
  const row = page.getByRole('row').filter({ hasText: name })
  await row.getByRole('button', { name: `Edit ${name}` }).click()
  const edit = page.getByRole('dialog', { name: `Edit ${name}` })
  await edit.getByLabel('Role').selectOption({ label: 'IT Staff' })
  await edit.getByRole('button', { name: 'Save changes' }).click()
  await expect(edit).toBeHidden()

  // From the admin menu, like a person would
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Audit log' }).click()
  await expect(page).toHaveURL('/admin/audit')
  await expect(page.getByRole('heading', { name: 'Audit log' })).toBeVisible()

  const newest = page.getByRole('table').getByRole('row').nth(1)
  await expect(newest.getByRole('cell').nth(1)).toHaveText('Role changed')
  await expect(newest.getByRole('cell').nth(2)).toHaveText('Admin User')
  await expect(newest.getByRole('cell').nth(3)).toHaveText(name)
  await expect(newest.getByRole('cell').nth(4)).toHaveText('Employee → IT Staff')

  // The action filter narrows the log to role changes, and keeps the change on top
  await page.getByRole('combobox', { name: 'Action' }).selectOption({ label: 'Role changed' })
  await expect(page).toHaveURL(/action=role_changed/)
  await expect(page.getByRole('table').getByRole('row').nth(1).getByRole('cell').nth(3)).toHaveText(name)
})
