// hr-flow.spec.ts – the HR flow from start to finish, against the real backend on this run's throwaway database:
// an admin creates an HR account → HR sets their own password → HR's navigation → HR adds an employee (Employee only)
// and can't touch agents or admins → the employee sets a password and creates a ticket → HR can't open /admin and
// can't see that ticket.
import type { Browser, Page } from '@playwright/test'
import { expect, test } from './support/fixtures'
import { authFile } from './support/users'

test.use({ storageState: authFile('admin') })

// Reads the one-time password from the dialog and closes it
async function takeTemporaryPassword(page: Page) {
  const dialog = page.getByRole('alertdialog')
  const password = (await dialog.locator('code').textContent())?.trim() ?? ''
  expect(password).toMatch(/^[A-Za-z0-9]{12,}$/)
  await dialog.getByRole('button', { name: 'Done' }).click()
  return password
}

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/login')
  await page.getByLabel('Work email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
}

// "Set your password" after the first sign-in with a temporary password
async function setOwnPassword(page: Page, temporary: string, next: string) {
  await expect(page).toHaveURL('/set-password')
  await expect(page.getByRole('heading', { name: 'Set your password' })).toBeVisible()
  await page.getByLabel('Temporary password').fill(temporary)
  await page.getByLabel('New password', { exact: true }).fill(next)
  await page.getByLabel('Confirm new password').fill(next)
  await page.getByRole('button', { name: 'Set password' }).click()
  await expect(page).toHaveURL('/tickets')
}

// A browser with no saved session
async function freshPage(browser: Browser) {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  return { context, page: await context.newPage() }
}

test('HR adds an employee → the employee sets a password and creates a ticket; HR stays within its limits', async ({
  page: admin,
  browser,
  uniq,
}) => {
  const hrName = `HR Person ${uniq}`
  const hrEmail = `hr.${uniq}@test.local`
  const employeeName = `New Employee ${uniq}`
  const employeeEmail = `employee.${uniq}@test.local`
  const ticketTitle = `${uniq} Monitor flickers`

  // 1. An admin creates the HR account and copies the temporary password from the dialog
  await admin.goto('/admin/users')
  await admin.getByRole('button', { name: 'Add user' }).click()
  const addHr = admin.getByRole('dialog', { name: 'Add user' })
  await addHr.getByLabel('Full name').fill(hrName)
  await addHr.getByLabel('Email').fill(hrEmail)
  await addHr.getByLabel('Role').selectOption({ label: 'HR' })
  await addHr.getByRole('button', { name: 'Create user' }).click()
  const hrTemporary = await takeTemporaryPassword(admin)

  // 2. HR signs in and has to set their own password first
  const { context: hrContext, page: hr } = await freshPage(browser)
  await signIn(hr, hrEmail, hrTemporary)
  await setOwnPassword(hr, hrTemporary, 'HrOwnPassword1')

  // 3. HR's navigation: Tickets, New ticket, Users, Departments and the profile link; no Dashboard
  const nav = hr.getByRole('navigation', { name: 'Main' })
  await expect(nav.getByRole('link')).toHaveText(['Tickets', 'New ticket', 'Users', 'Departments'])
  await expect(nav.getByRole('link', { name: 'Dashboard' })).toHaveCount(0)
  await expect(hr.getByRole('link', { name: `My profile (${hrName})` })).toBeVisible()
  await hr.getByRole('link', { name: `My profile (${hrName})` }).click()
  await expect(hr).toHaveURL('/profile')
  await expect(hr.getByText(hrEmail)).toBeVisible()

  // 4. HR adds an employee: the only role on offer is Employee
  await nav.getByRole('link', { name: 'Users' }).click()
  await hr.getByRole('button', { name: 'Add user' }).click()
  const addEmployee = hr.getByRole('dialog', { name: 'Add user' })
  await expect(addEmployee.getByRole('combobox', { name: 'Role' })).toHaveCount(0)
  await expect(addEmployee.getByText('HR can only create employee accounts.')).toBeVisible()
  await addEmployee.getByLabel('Full name').fill(employeeName)
  await addEmployee.getByLabel('Email').fill(employeeEmail)
  await addEmployee.getByRole('button', { name: 'Create user' }).click()
  const employeeTemporary = await takeTemporaryPassword(hr)
  const employeeRow = hr.getByRole('row').filter({ hasText: employeeEmail })
  await expect(employeeRow.getByText('Employee', { exact: true })).toBeVisible()

  // …and can't edit or reset agents or admins (no buttons on their rows), but can on the employee's
  for (const seeded of ['Arben Krasniqi', 'Admin User']) {
    const row = hr.getByRole('row').filter({ hasText: seeded })
    await expect(row.getByRole('button', { name: `Edit ${seeded}` })).toHaveCount(0)
    await expect(row.getByRole('button', { name: `Reset password for ${seeded}` })).toHaveCount(0)
  }
  await expect(employeeRow.getByRole('button', { name: `Edit ${employeeName}` })).toBeVisible()

  // 5. The employee signs in, sets a password and creates a ticket
  const { context: employeeContext, page: employee } = await freshPage(browser)
  await signIn(employee, employeeEmail, employeeTemporary)
  await setOwnPassword(employee, employeeTemporary, 'EmployeeOwn1')
  await employee.goto('/tickets/new')
  await employee.getByRole('textbox', { name: 'Title' }).fill(ticketTitle)
  await employee.getByRole('combobox', { name: 'Category' }).selectOption('Hardware')
  await employee.getByRole('textbox', { name: 'Description' }).fill('The second monitor flickers every few minutes.')
  await employee.getByRole('button', { name: 'Submit ticket' }).click()
  await expect(employee).toHaveURL(/\/tickets\/\d+$/)
  await expect(employee.getByRole('heading', { name: ticketTitle })).toBeVisible()
  const ticketPath = new URL(employee.url()).pathname
  await employeeContext.close()

  // 6. HR can't open the admin dashboard, and can't see the employee's ticket (not listed, not openable)
  await hr.goto('/admin')
  await expect(hr).toHaveURL('/tickets')
  await expect(hr.getByRole('heading', { name: 'My tickets' })).toBeVisible()
  await expect(hr.getByRole('link', { name: ticketTitle })).toHaveCount(0)
  await hr.goto(ticketPath)
  await expect(hr.getByText('You can only view your own tickets')).toBeVisible()
  await expect(hr.getByRole('heading', { name: ticketTitle })).toHaveCount(0)
  await hrContext.close()
})
