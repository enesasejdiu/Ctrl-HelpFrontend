// forced-password-change.spec.ts – how people get their own password. A new account gets an emailed set-password
// link (no password is shown to the admin); the link works once, and "Resend link" replaces it. An Admin/HR reset
// ends the user's sessions and emails a reset link. Later anyone can change theirs from the top bar
// (/change-password). Real backend, real (throwaway) database, with email set up; the emails are read from this run's
// mail folder (support/mail.ts). The temporary-password mode (email not set up) is covered by the component tests.
import type { Browser, Page } from '@playwright/test'
import { expect, test } from './support/fixtures'
import { setPasswordLink, sentMail } from './support/mail'
import { authFile } from './support/users'

test.use({ storageState: authFile('admin') })

// Adds an employee; the page says the link was emailed, and no password is shown
async function addUser(page: Page, name: string, email: string) {
  await page.goto('/admin/users')
  await page.getByRole('button', { name: 'Add user' }).click()
  const dialog = page.getByRole('dialog', { name: 'Add user' })
  await dialog.getByLabel('Full name').fill(name)
  await dialog.getByLabel('Email').fill(email)
  await dialog.getByRole('button', { name: 'Create user' }).click()
  await expect(page.getByRole('status')).toHaveText(
    `A link to set the password was emailed to ${email}. It expires in 48 hours.`,
  )
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
}

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/login')
  await page.getByLabel('Work email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
}

// Logs out and waits until the app is on /login, which it only goes to once the logout request has finished.
// Navigating away sooner (e.g. signIn's page.goto) can cancel that request, in Firefox especially: the session then
// stays alive, /login forwards the still-logged-in user to /tickets, and the sign-in form never appears.
async function logOut(page: Page) {
  await page.getByRole('button', { name: 'Log out' }).click()
  await expect(page).toHaveURL('/login')
}

// The emailed link's page: choose a password; it ends on the sign-in page
async function setPasswordWithLink(page: Page, link: string, next: string) {
  await page.goto(link)
  await expect(page.getByRole('heading', { name: 'Set your password' })).toBeVisible()
  await page.getByLabel('New password', { exact: true }).fill(next)
  await page.getByLabel('Confirm new password').fill(next)
  await page.getByRole('button', { name: 'Set password' }).click()
  await expect(page).toHaveURL('/login')
  await expect(page.getByRole('status')).toHaveText('Password set, please log in.')
}

// "Change password" (/change-password): changing your own password later, from the top bar
async function choosePassword(page: Page, current: string, next: string) {
  await page.getByLabel(/Temporary password|Current password/).fill(current)
  await page.getByLabel('New password', { exact: true }).fill(next)
  await page.getByLabel('Repeat new password').fill(next)
  await page.getByRole('button', { name: 'Save new password' }).click()
}

// A browser with no saved session, for the new user
async function freshPage(browser: Browser) {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  return { context, page: await context.newPage() }
}

// Adds an account and has its owner set a password with the emailed link; returns their signed-in page
async function newUserWithPassword(page: Page, browser: Browser, name: string, email: string, password: string) {
  await addUser(page, name, email)
  const fresh = await freshPage(browser)
  await setPasswordWithLink(fresh.page, await setPasswordLink(email), password)
  await fresh.page.getByLabel('Password', { exact: true }).fill(password)
  await fresh.page.getByRole('button', { name: 'Sign in' }).click()
  await expect(fresh.page).toHaveURL('/tickets')
  return fresh
}

test('a new account sets its own password with the emailed link, which works only once', async ({
  page,
  browser,
  uniq,
}) => {
  // Two browsers (admin and user): slow in Firefox, like hr-flow.spec.ts, so triple the time
  test.slow()
  const email = `${uniq}@test.local`
  await addUser(page, `New Starter ${uniq}`, email)

  // Nothing to sign in with yet: the usual message
  const { context, page: newUser } = await freshPage(browser)
  await signIn(newUser, email, 'password123')
  await expect(newUser.getByRole('alert')).toHaveText('Wrong email or password')

  // The emailed link: no login needed, a greeting, the live checklist, then the sign-in page with the email filled in
  const link = await setPasswordLink(email)
  expect(new URL(link).pathname).toBe('/set-password')
  await newUser.goto(link)
  await expect(newUser.getByText(`Choose a password for ${email}.`)).toBeVisible()
  await expect(newUser.getByLabel('Temporary password')).toHaveCount(0)
  await newUser.getByLabel('New password', { exact: true }).fill('MyOwnPassword1')
  await newUser.getByLabel('Confirm new password').fill('MyOwnPassword1')
  await newUser.getByRole('button', { name: 'Set password' }).click()
  await expect(newUser).toHaveURL('/login')
  await expect(newUser.getByRole('status')).toHaveText('Password set, please log in.')
  await expect(newUser.getByLabel('Work email')).toHaveValue(email)

  await newUser.getByLabel('Password', { exact: true }).fill('MyOwnPassword1')
  await newUser.getByRole('button', { name: 'Sign in' }).click()
  await expect(newUser).toHaveURL('/tickets')
  await newUser.goto('/tickets/new')
  await expect(newUser.getByRole('heading', { name: 'New ticket' })).toBeVisible()

  // The same link again: already used
  await logOut(newUser)
  await newUser.goto(link)
  await expect(newUser.getByRole('heading', { name: 'This link has already been used' })).toBeVisible()
  await expect(newUser.getByLabel('New password', { exact: true })).toHaveCount(0)
  await context.close()
})

test('"Resend link" sends a new link; the old one stops working', async ({ page, browser, uniq }) => {
  // Two browsers (admin and user): slow in Firefox, like hr-flow.spec.ts, so triple the time
  test.slow()
  const email = `${uniq}@test.local`
  const name = `Resend Me ${uniq}`
  await addUser(page, name, email)
  const oldLink = await setPasswordLink(email)
  const before = sentMail().length

  await page.getByRole('button', { name: `Resend link to ${name}` }).click()
  await expect(page.getByRole('status')).toContainText('The previous link no longer works.')
  const newLink = await setPasswordLink(email, { after: before })
  expect(newLink).not.toBe(oldLink)

  const { context, page: newUser } = await freshPage(browser)
  await newUser.goto(oldLink)
  await expect(newUser.getByRole('heading', { name: 'This link is not valid' })).toBeVisible()
  await setPasswordWithLink(newUser, newLink, 'MyOwnPassword1')
  await context.close()

  // Once the password is set, the row no longer offers it
  await page.reload()
  await expect(page.getByRole('row').filter({ hasText: email })).toBeVisible()
  await expect(page.getByRole('button', { name: `Resend link to ${name}` })).toHaveCount(0)
})

test('a password reset during a session ends it; the user chooses a new password with the emailed reset link', async ({
  page,
  browser,
  uniq,
}) => {
  // Two browsers (admin and user): slow in Firefox, like hr-flow.spec.ts, so triple the time
  test.slow()
  const email = `${uniq}@test.local`
  const name = `Reset Me ${uniq}`
  const { context, page: user } = await newUserWithPassword(page, browser, name, email, 'FirstChoice123')
  const before = sentMail().length

  // Admin resets it while the user is still signed in: no password is shown, a link is emailed
  await page.reload()
  await page.getByRole('button', { name: `Reset password for ${name}` }).click()
  await page
    .getByRole('alertdialog', { name: 'Reset password' })
    .getByRole('button', { name: 'Reset password' })
    .click()
  await expect(page.getByRole('status')).toHaveText(
    `A link to set the password was emailed to ${email}. It expires in 48 hours.`,
  )
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
  const link = await setPasswordLink(email, { after: before })
  expect(sentMail().at(-1)?.subject).toBe('Reset your TicketFlow password')

  // The reset ended the user's session, and the old password no longer works
  await user.reload()
  await expect(user).toHaveURL(/\/login/)
  await signIn(user, email, 'FirstChoice123')
  await expect(user.getByRole('alert')).toHaveText('Wrong email or password')

  // The reset link: a new password, then sign in with it
  await user.goto(link)
  await expect(user.getByRole('heading', { name: 'Choose a new password' })).toBeVisible()
  await expect(user).toHaveURL('/set-password') // the token is gone from the address bar
  await user.getByLabel('New password', { exact: true }).fill('SecondChoice123')
  await user.getByLabel('Confirm new password').fill('SecondChoice123')
  await user.getByRole('button', { name: 'Set password' }).click()
  await expect(user.getByRole('status')).toHaveText('Password set, please log in.')
  await user.getByLabel('Password', { exact: true }).fill('SecondChoice123')
  await user.getByRole('button', { name: 'Sign in' }).click()
  await expect(user).toHaveURL('/tickets')
  await context.close()
})

test('anyone can change their password from the top bar', async ({ page, browser, uniq }) => {
  // Two browsers (admin and user): slow in Firefox, like hr-flow.spec.ts, so triple the time
  test.slow()
  const email = `${uniq}@test.local`
  const { context, page: user } = await newUserWithPassword(page, browser, `Changer ${uniq}`, email, 'FirstChoice123')

  await user.getByRole('link', { name: 'Change password' }).click()
  await expect(user.getByRole('heading', { name: 'Change password' })).toBeVisible()
  await choosePassword(user, 'FirstChoice123', 'SecondChoice123')
  await expect(user).toHaveURL('/tickets')

  await logOut(user)
  await signIn(user, email, 'SecondChoice123')
  await expect(user).toHaveURL('/tickets')
  await context.close()
})
