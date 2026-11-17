// departments.spec.ts – the Add/Edit user dialog picks a department from the real backend's list and saves it as
// department_id; the Users table shows the department's name. The test makes its own two departments through the API
// (named with its unique prefix) and deletes them at the end, so it relies on no seeded data and leaves none behind:
// it runs the same locally and against staging (npm run e2e:staging).
import { expect, test } from './support/fixtures'
import { authFile } from './support/users'

test.use({ storageState: authFile('admin') })

test('add a user in a department, then move them to another one and then to none', async ({ page, api, uniq }) => {
  const name = `Dept Person ${uniq}`
  const first: { id: number; name: string } = await api.send('post', 'departments', 'admin', { name: `${uniq} Sales` })
  const second: { id: number; name: string } = await api.send('post', 'departments', 'admin', { name: `${uniq} Ops` })
  // How this backend gives a new account its password: an emailed link (email set up), or a temporary password shown
  // once (no email; e.g. staging). Both are correct; the test checks the one this backend uses.
  const { email_enabled: emailEnabled } = await api.get('settings/public')

  await page.goto('/admin/users')
  await page.getByRole('button', { name: 'Add user' }).click()
  const add = page.getByRole('dialog', { name: 'Add user' })
  await add.getByLabel('Full name').fill(name)
  await add.getByLabel('Email').fill(`${uniq}@example.test`)
  await add.getByLabel(/Department/).selectOption({ label: first.name })
  await add.getByRole('button', { name: 'Create user' }).click()
  if (emailEnabled) {
    // No password dialog: the new user gets an emailed set-password link
    await expect(page.getByRole('status')).toContainText('A link to set the password was emailed')
  } else {
    // The temporary password, shown once, then the dialog is closed
    const shown = page.getByRole('alertdialog')
    await expect(shown.locator('code')).toHaveText(/^[A-Za-z0-9]{12,}$/)
    await shown.getByRole('button', { name: 'Done' }).click()
  }

  const row = page.getByRole('row').filter({ hasText: name })
  await expect(row.getByRole('cell', { name: first.name, exact: true })).toBeVisible()

  await row.getByRole('button', { name: `Edit ${name}` }).click()
  const edit = page.getByRole('dialog', { name: `Edit ${name}` })
  await expect(edit.getByLabel(/Department/)).toHaveValue(String(first.id)) // the current department is selected
  await edit.getByLabel(/Department/).selectOption({ label: second.name })
  await edit.getByRole('button', { name: 'Save changes' }).click()
  await expect(row.getByRole('cell', { name: second.name, exact: true })).toBeVisible()

  // Survives a reload: it was saved as department_id and comes back with the joined name
  await page.reload()
  await expect(
    page.getByRole('row').filter({ hasText: name }).getByRole('cell', { name: second.name, exact: true }),
  ).toBeVisible()

  await page
    .getByRole('row')
    .filter({ hasText: name })
    .getByRole('button', { name: `Edit ${name}` })
    .click()
  await page
    .getByRole('dialog', { name: `Edit ${name}` })
    .getByLabel(/Department/)
    .selectOption({ label: 'No department' })
  await page
    .getByRole('dialog', { name: `Edit ${name}` })
    .getByRole('button', { name: 'Save changes' })
    .click()
  await expect(
    page.getByRole('row').filter({ hasText: name }).getByRole('cell', { name: '—', exact: true }),
  ).toBeVisible()

  // Nobody is in either department any more, so both can go (DELETE refuses a department with people in it)
  await api.send('delete', `departments/${first.id}`, 'admin')
  await api.send('delete', `departments/${second.id}`, 'admin')
})
