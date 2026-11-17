// canned-responses.spec.ts – an agent creates a personal canned response with {{requester.name}}, opens a ticket, types
// "/" in the comment box, picks it, sees the requester's name filled in (and that Ctrl+Z undoes the insertion), sends
// it, and the comment appears. The ticket is the test's own (unique title); the response is deleted at the end, so the
// test runs the same locally and against staging.
import { expect, test } from './support/fixtures'
import { account } from './support/users'

test('an agent inserts a canned response with the requester filled in, and sends it', async ({
  browser,
  api,
  uniq,
}) => {
  const ticket = await api.createTicket({ title: `${uniq} Printer jam` })
  const requester = account('user')
  const title = `${uniq} Greeting`

  // The agent, signed in in a browser of their own (the cookies land in this context)
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const page = await context.newPage()
  const { email, password } = account('agent')
  expect(await page.request.post('/api/auth/login', { data: { email, password } }), 'agent login').toBeOK()

  try {
    // 1. A personal response
    await page.goto('/settings/canned-responses')
    await page.getByRole('button', { name: 'New response' }).click()
    const dialog = page.getByRole('dialog', { name: 'New canned response' })
    await dialog.getByRole('textbox', { name: 'Title' }).fill(title)
    await dialog.getByRole('textbox', { name: 'Text' }).fill('Hello {{requester.name}}, we are on it.')
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Response saved.' })).toBeVisible()
    await expect(page.getByRole('cell', { name: title, exact: true })).toBeVisible()

    // 2. On the ticket: "/" opens the picker; search, Enter inserts it with the name filled in
    await page.goto(`/tickets/${ticket.id}`)
    const comment = page.getByRole('textbox', { name: 'Comment' })
    await comment.click()
    await comment.press('/')
    const search = page.getByRole('combobox', { name: 'Search canned responses' })
    await expect(search).toBeFocused()
    await search.fill(uniq)
    const option = page.getByRole('option', { name: new RegExp(title) })
    await expect(option).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('region', { name: 'Preview' })).toContainText(`Hello ${requester.name}, we are on it.`)
    await search.press('Enter')
    const filled = `Hello ${requester.name}, we are on it.`
    await expect(comment).toHaveValue(filled)
    await expect(comment).toBeFocused()

    // The browser's undo takes the insertion back out (the "/" returns), like typed text
    await comment.press('ControlOrMeta+z')
    await expect(comment).toHaveValue('/')

    // Insert it again with the button, edit, and send
    await comment.fill('')
    await page.getByRole('button', { name: 'Canned responses' }).click()
    await search.fill(uniq)
    await expect(option).toHaveAttribute('aria-selected', 'true')
    await search.press('Enter')
    await expect(comment).toHaveValue(filled)
    await comment.press('End')
    await comment.pressSequentially(' Thanks!')
    await page.getByRole('button', { name: 'Add comment' }).click()

    // 3. The comment is on the ticket, exactly as sent
    await expect(page.getByText(`${filled} Thanks!`, { exact: true })).toBeVisible()
    await expect(comment).toHaveValue('')
  } finally {
    const mine: { id: number; title: string }[] = await api.get(
      `canned-responses?scope=mine&q=${encodeURIComponent(uniq)}`,
      'agent',
    )
    for (const response of mine.filter((r) => r.title === title)) {
      await api.send('delete', `canned-responses/${response.id}`, 'agent')
    }
    await context.close()
  }
})
