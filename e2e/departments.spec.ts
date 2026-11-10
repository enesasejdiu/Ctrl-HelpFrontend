// departments.spec.ts – the Add/Edit user dialog picks a department from the real backend's list (the seed's
// departments) and saves it as department_id; the Users table shows the department's name.
import { expect, test } from './support/fixtures'
import { authFile } from './support/users'

test.use({ storageState: authFile('admin') })

test('add a user in a department, then move them to another one and then to none', async ({ page, uniq }) => {
  const name = `Dept Person ${uniq}`
  await page.goto('/admin/users')

  await page.getByRole('button', { name: 'Add user' }).click()
  const add = page.getByRole('dialog', { name: 'Add user' })
  await add.getByLabel('Full name').fill(name)
  await add.getByLabel('Email').fill(`${uniq}@test.local`)
  await add.getByLabel(/Department/).selectOption({ label: 'Sales' })
  await add.getByRole('button', { name: 'Create user' }).click()
  // No password dialog: the new user gets an emailed set-password link
  await expect(page.getByRole('status')).toContainText('A link to set the password was emailed')

  const row = page.getByRole('row').filter({ hasText: name })
  await expect(row.getByRole('cell', { name: 'Sales', exact: true })).toBeVisible()

  await row.getByRole('button', { name: `Edit ${name}` }).click()
  const edit = page.getByRole('dialog', { name: `Edit ${name}` })
  await expect(edit.getByLabel(/Department/)).toHaveValue(/\d+/) // the current department is selected
  await edit.getByLabel(/Department/).selectOption({ label: 'Operations' })
  await edit.getByRole('button', { name: 'Save changes' }).click()
  await expect(row.getByRole('cell', { name: 'Operations', exact: true })).toBeVisible()

  // Survives a reload: it was saved as department_id and comes back with the joined name
  await page.reload()
  await expect(page.getByRole('row').filter({ hasText: name }).getByRole('cell', { name: 'Operations', exact: true })).toBeVisible()

  await page.getByRole('row').filter({ hasText: name }).getByRole('button', { name: `Edit ${name}` }).click()
  await page.getByRole('dialog', { name: `Edit ${name}` }).getByLabel(/Department/).selectOption({ label: 'No department' })
  await page.getByRole('dialog', { name: `Edit ${name}` }).getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByRole('row').filter({ hasText: name }).getByRole('cell', { name: '—', exact: true })).toBeVisible()
})
