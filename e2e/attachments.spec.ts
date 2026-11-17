// attachments.spec.ts – attachments end to end, against the real backend on this run's throwaway database (its files
// go to the run's temporary UPLOAD_DIR, never the backend's uploads/): an employee creates a ticket with a PNG and a
// PDF, a .exe is refused, a text file named .png is refused by the backend, an agent downloads the PDF (the exact
// bytes, as a download, with Content-Disposition: attachment and nosniff), and the employee deletes their PNG.
import fs from 'node:fs'
import type { Browser } from '@playwright/test'
import { expect, test } from './support/fixtures'
import { account, authFile } from './support/users'

test.use({ storageState: authFile('user') })

// Real file contents: the backend checks the signature, not just the name
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52])
const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n')
const EXE = Buffer.from('MZ\x90\x00\x03\x00\x00\x00', 'latin1')

async function signedInAs(browser: Browser, { email, password }: { email: string; password: string }) {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] }, acceptDownloads: true })
  const page = await context.newPage()
  await page.goto('/login')
  await page.getByLabel('Work email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL('/tickets')
  return { context, page }
}

test('employee attaches a PNG and a PDF, a .exe is refused, an agent downloads, the employee deletes', async ({
  page,
  browser,
  uniq,
}) => {
  // 1. New ticket with files. A .exe never gets on the list.
  await page.goto('/tickets/new')
  await page.getByRole('textbox', { name: 'Title' }).fill(`${uniq} Printer shows an error`)
  await page.getByRole('combobox', { name: 'Category' }).selectOption('Hardware')
  await page.getByRole('textbox', { name: 'Description' }).fill('Photo of the error and the invoice attached.')

  const picker = page.getByLabel(/Attachments/)
  await picker.setInputFiles({ name: 'setup.exe', mimeType: 'application/octet-stream', buffer: EXE })
  await expect(page.getByRole('alert')).toHaveText("setup.exe: this file type isn't allowed")
  await expect(page.getByRole('list', { name: 'Chosen files' })).toHaveCount(0)

  await picker.setInputFiles([
    { name: 'screen.png', mimeType: 'image/png', buffer: PNG },
    { name: 'invoice.pdf', mimeType: 'application/pdf', buffer: PDF },
  ])
  const chosen = page.getByRole('list', { name: 'Chosen files' })
  await expect(chosen.getByRole('listitem')).toHaveCount(2)
  await page.getByRole('button', { name: 'Submit ticket' }).click()

  await expect(page).toHaveURL(/\/tickets\/\d+$/)
  const ticketPath = new URL(page.url()).pathname
  const card = page.getByRole('region', { name: /^Attachments/ })
  await expect(card.getByRole('heading', { name: 'Attachments (2)' })).toBeVisible()
  await expect(card.getByText('screen.png')).toBeVisible()
  await expect(card.getByText('invoice.pdf')).toBeVisible()

  // 2. A text file named .png passes the browser's check (by name) but the backend checks the content and refuses it
  await card
    .getByLabel(/Add files/)
    .setInputFiles({ name: 'fake.png', mimeType: 'image/png', buffer: Buffer.from('not an image') })
  await card.getByRole('button', { name: 'Upload 1 file' }).click()
  await expect(card.getByRole('alert')).toContainText("fake.png: this file type isn't allowed")
  await expect(card.getByRole('heading', { name: 'Attachments (2)' })).toBeVisible()

  // 3. An agent opens the ticket and downloads the PDF: a download (not a page), with the exact bytes
  const agent = await signedInAs(browser, account('agent'))
  await agent.page.goto(ticketPath)
  const agentCard = agent.page.getByRole('region', { name: /^Attachments/ })
  await expect(agentCard.getByRole('heading', { name: 'Attachments (2)' })).toBeVisible()
  const [download] = await Promise.all([
    agent.page.waitForEvent('download'),
    agentCard.getByRole('link', { name: 'Download invoice.pdf' }).click(),
  ])
  expect(download.suggestedFilename()).toBe('invoice.pdf')
  const saved = await download.path()
  expect(fs.readFileSync(saved).equals(PDF)).toBe(true)
  // The same link's response headers: always a download, never shown inline (so an uploaded file can't run as a page
  // on our origin), and the browser must not guess another type than the one sent
  const href = await agentCard.getByRole('link', { name: 'Download invoice.pdf' }).getAttribute('href')
  const response = await agent.page.request.get(new URL(href!, agent.page.url()).toString())
  expect(response.status()).toBe(200)
  expect(response.headers()['content-disposition']).toMatch(/^attachment;/)
  expect(response.headers()['content-disposition']).toContain('invoice.pdf')
  expect(response.headers()['x-content-type-options']).toBe('nosniff')
  expect(response.headers()['content-type']).toMatch(/^application\/pdf\b/)
  expect((await response.body()).equals(PDF)).toBe(true)
  // The agent can see the employee's files but not delete them
  await expect(agentCard.getByRole('button', { name: /^Delete / })).toHaveCount(0)
  await agent.context.close()

  // 4. The employee deletes their PNG
  await card.getByRole('button', { name: 'Delete screen.png' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click()
  await expect(card.getByRole('heading', { name: 'Attachments (1)' })).toBeVisible()
  await expect(card.getByText('screen.png')).toHaveCount(0)
  await expect(card.getByText('invoice.pdf')).toBeVisible()
})
