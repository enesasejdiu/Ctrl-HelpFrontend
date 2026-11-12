// forgot-password.spec.ts – "Forgot password" from the sign-in page, against the real backend with email set up: the
// same answer for any address, a one-time reset link (1 hour) by email, the current password still working until the
// link is used, then only the new one, a "password changed" notice, and a used link that points back to
// /forgot-password. Emails are read from this run's mail folder (support/mail.ts).
import type { Page } from '@playwright/test'
import { expect, test } from './support/fixtures'
import { sentMail, setPasswordLink } from './support/mail'

// Signed out: this is for people who can't sign in
test.use({ storageState: { cookies: [], origins: [] } })

const ANSWER = "If an account exists for this email, we've sent a password reset link."

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/login')
  await page.getByLabel('Work email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
}

// Asks for a reset link on /forgot-password; returns the API's answer (status, body)
async function requestReset(page: Page, email: string) {
  await page.goto('/forgot-password')
  await page.getByLabel('Work email').fill(email)
  const response = page.waitForResponse((r) => r.url().endsWith('/api/auth/forgot-password'))
  await page.getByRole('button', { name: 'Send reset link' }).click()
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible()
  await expect(page.getByRole('status')).toHaveText(ANSWER)
  const answer = await response
  return { status: answer.status(), body: await answer.json() }
}

test('a reset link by email; the old password works until the link sets a new one', async ({ page, api, uniq }) => {
  // Three sign-ins, a new password and two emails: more than the default 30 seconds on a busy machine
  test.slow()
  const account = await api.createReadyEmployee(`Forgetful ${uniq}`, `forgetful.${uniq}@test.local`, 'OldPassword123')
  const before = sentMail().length

  // From the sign-in page, which takes the typed email along
  await page.goto('/login')
  await page.getByLabel('Work email').fill(account.email)
  await page.getByRole('link', { name: 'Forgot password?' }).click()
  await expect(page.getByRole('heading', { name: 'Forgot your password?' })).toBeVisible()
  await expect(page.getByLabel('Work email')).toHaveValue(account.email)
  await page.getByRole('button', { name: 'Send reset link' }).click()
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible()
  await expect(page.getByRole('status')).toHaveText(ANSWER)

  const link = await setPasswordLink(account.email, { after: before })
  const email = sentMail().findLast((m) => m.to === account.email)!
  expect(email.subject).toBe('Reset your TicketFlow password')
  expect(email.text).toContain('This link expires in 1 hour and can be used once')
  expect(email.text).toContain("If you didn't request this, you can ignore this email. Your password hasn't changed.")

  // Asking changed nothing yet: the old password still signs in
  await signIn(page, account.email, 'OldPassword123')
  await expect(page).toHaveURL('/tickets')
  // The app goes to /login only once the logout request has finished; navigating sooner can cancel it (Firefox)
  await page.getByRole('button', { name: 'Log out' }).click()
  await expect(page).toHaveURL('/login', { timeout: 15_000 })

  // The link: a new password, then only that one works
  await page.goto(link)
  await expect(page.getByRole('heading', { name: 'Choose a new password' })).toBeVisible()
  await expect(page).toHaveURL('/set-password')
  await page.getByLabel('New password', { exact: true }).fill('NewPassword456')
  await page.getByLabel('Confirm new password').fill('NewPassword456')
  await page.getByRole('button', { name: 'Set password' }).click()
  await expect(page.getByRole('status')).toHaveText('Password set, please log in.')

  // "Your password was changed", without a link
  await expect
    .poll(() =>
      sentMail().filter((m) => m.to === account.email && m.subject === 'Your TicketFlow password was changed'),
    )
    .toHaveLength(1)
  const notice = sentMail().findLast((m) => m.subject === 'Your TicketFlow password was changed')!
  expect(notice.link).toBeUndefined()
  expect(notice.text).not.toContain('/set-password')

  // The same link again (still signed out): used, with the way to ask for a new one
  await page.goto(link)
  await expect(page.getByRole('heading', { name: 'This link has already been used' })).toBeVisible()
  await page.getByRole('link', { name: 'Request a new link' }).click()
  await expect(page).toHaveURL('/forgot-password')

  // Only the new password signs in now
  await signIn(page, account.email, 'OldPassword123')
  await expect(page.getByRole('alert')).toHaveText('Wrong email or password')
  await page.getByLabel('Password', { exact: true }).fill('NewPassword456')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL('/tickets')
})

test('an unknown address gets exactly the same answer as a real account, and no email', async ({ page, api, uniq }) => {
  const account = await api.createReadyEmployee(`Known ${uniq}`, `known.${uniq}@test.local`)
  const nobody = `nobody.${uniq}@test.local`
  const before = sentMail().length

  const known = await requestReset(page, account.email)
  const unknown = await requestReset(page, nobody)
  expect(unknown).toEqual(known)
  expect(known).toEqual({ status: 200, body: { message: ANSWER } })

  // The real account's link arrives; give the backend's background work the same time, then check none went to nobody
  await setPasswordLink(account.email, { after: before })
  expect(
    sentMail()
      .slice(before)
      .filter((m) => m.to === nobody),
  ).toEqual([])
})
