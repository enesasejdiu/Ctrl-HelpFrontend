// logout-everywhere.spec.ts – "Log out everywhere" on the profile page, against the real backend: the same user is
// signed in in two browsers (say a laptop and a phone); logging out everywhere on one ends the other's session too, so
// its next click lands on sign-in. Uses an account of its own: the seeded ones' saved sessions are shared with other
// specs, and logging them out everywhere would end those too.
import type { Browser } from '@playwright/test'
import { expect, test } from './support/fixtures'

async function signIn(browser: Browser, email: string, password: string) {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const page = await context.newPage()
  await page.goto('/login')
  await page.getByLabel('Work email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('heading', { name: 'My tickets' })).toBeVisible()
  return { context, page }
}

test('log out everywhere in one browser: the other browser is signed out too', async ({ browser, api, uniq }) => {
  // Two browsers, like hr-flow.spec.ts: slow in Firefox, so triple the time
  test.slow()
  const account = await api.createReadyEmployee(`Two Devices ${uniq}`, `${uniq}@example.test`)
  const laptop = await signIn(browser, account.email, account.password)
  const phone = await signIn(browser, account.email, account.password)

  try {
    // On the laptop: Profile → Log out everywhere → confirm
    await laptop.page.getByRole('link', { name: /My profile/ }).click()
    const card = laptop.page.getByRole('region', { name: 'Password' })
    await card.getByRole('button', { name: 'Log out everywhere' }).click()
    const dialog = laptop.page.getByRole('alertdialog', { name: 'Log out everywhere?' })
    await expect(dialog).toContainText('This signs you out on all your devices, including this one.')
    await dialog.getByRole('button', { name: 'Log out everywhere' }).click()

    await expect(laptop.page).toHaveURL('/login')
    await expect(laptop.page.getByRole('status')).toHaveText("You've been signed out everywhere.")

    // The laptop really is signed out: a protected page sends it back to sign-in, without the message again
    await laptop.page.goto('/tickets')
    await expect(laptop.page).toHaveURL('/login')
    await expect(laptop.page.getByText("You've been signed out everywhere.")).toHaveCount(0)

    // On the phone, still showing its tickets: the next click asks the API, gets 401, and lands on sign-in
    await phone.page.getByRole('link', { name: /My profile/ }).click()
    await expect(phone.page).toHaveURL('/login')
    await expect(phone.page.getByRole('status')).toHaveText('Your session has ended. Please sign in again.')

    // Signing in again works as usual, and goes back to the page the click was for
    await phone.page.getByLabel('Work email').fill(account.email)
    await phone.page.getByLabel('Password', { exact: true }).fill(account.password)
    await phone.page.getByRole('button', { name: 'Sign in' }).click()
    await expect(phone.page.getByRole('heading', { name: 'My profile' })).toBeVisible()
  } finally {
    await laptop.context.close()
    await phone.context.close()
  }
})
