// forgot-password.spec.ts – "Forgot password" from the sign-in page, against the real backend with email set up: the
// same answer for any address, a one-time reset link by email, the current password still working until the link is
// used, and then only the new one. Emails are read from this run's mail folder (support/mail.ts).
import { expect, test } from './support/fixtures'
import { sentMail, setPasswordLink } from './support/mail'

// Signed out: this is for people who can't sign in
test.use({ storageState: { cookies: [], origins: [] } })

const ANSWER = "If there's an active account for that email, we've sent it a link to choose a new password."

test('a reset link by email; the old password works until the link sets a new one', async ({ page, api, uniq }) => {
  const account = await api.createReadyEmployee(`Forgetful ${uniq}`, `forgetful.${uniq}@test.local`, 'OldPassword123')
  const before = sentMail().length

  await page.goto('/login')
  await page.getByLabel('Work email').fill(account.email)
  await page.getByRole('link', { name: 'Forgot password?' }).click()
  await expect(page.getByRole('heading', { name: 'Forgot your password?' })).toBeVisible()
  await expect(page.getByLabel('Work email')).toHaveValue(account.email)
  await page.getByRole('button', { name: 'Send reset link' }).click()
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible()
  await expect(page.getByRole('status')).toContainText(ANSWER)

  const link = await setPasswordLink(account.email, { after: before })
  expect(sentMail().at(-1)?.subject).toBe('Reset your TicketFlow password')

  // Asking changed nothing yet: the old password still signs in
  await page.goto('/login')
  await page.getByLabel('Work email').fill(account.email)
  await page.getByLabel('Password', { exact: true }).fill('OldPassword123')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL('/tickets')
  await page.getByRole('button', { name: 'Log out' }).click()
  await expect(page).toHaveURL('/login')

  // The link: a new password, then only that one works
  await page.goto(link)
  await expect(page.getByRole('heading', { name: 'Choose a new password' })).toBeVisible()
  await expect(page).toHaveURL('/set-password')
  await page.getByLabel('New password', { exact: true }).fill('NewPassword456')
  await page.getByLabel('Confirm new password').fill('NewPassword456')
  await page.getByRole('button', { name: 'Set password' }).click()
  await expect(page.getByRole('status')).toHaveText('Password set, please log in.')

  await page.getByLabel('Password', { exact: true }).fill('OldPassword123')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('alert')).toHaveText('Wrong email or password')
  await page.getByLabel('Password', { exact: true }).fill('NewPassword456')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL('/tickets')
})

test('an address without an account gets the same answer, and no email', async ({ page, uniq }) => {
  const before = sentMail().length
  await page.goto('/forgot-password')
  await page.getByLabel('Work email').fill(`nobody.${uniq}@test.local`)
  await page.getByRole('button', { name: 'Send reset link' }).click()
  await expect(page.getByRole('status')).toContainText(ANSWER)
  // Give the backend's background work a moment, then check nothing went out
  await page.waitForTimeout(1000)
  expect(
    sentMail()
      .slice(before)
      .filter((m) => m.to === `nobody.${uniq}@test.local`),
  ).toEqual([])
})
