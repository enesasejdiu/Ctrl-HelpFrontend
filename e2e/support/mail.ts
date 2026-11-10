// mail.ts – the emails this run's backend "sent". The e2e backend runs with NODE_ENV=test, so nothing leaves the
// machine: every email is saved as a .json file in MAIL_OUTBOX_DIR instead (see scripts/e2e-backend.mjs), and these
// helpers read them, e.g. to open a new account's set-password link.
import { expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { MAIL_OUTBOX_DIR } from '../../scripts/e2e-env.mjs'

export type SentMail = { to: string; subject: string; text: string; html: string; link?: string }

// Every email sent so far, oldest first (file names start with the time they were written)
export function sentMail(): SentMail[] {
  if (!fs.existsSync(MAIL_OUTBOX_DIR)) return []
  return fs
    .readdirSync(MAIL_OUTBOX_DIR)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => JSON.parse(fs.readFileSync(path.join(MAIL_OUTBOX_DIR, file), 'utf8')) as SentMail)
}

// The link from the newest set-password email to this address. Emails go out just after the response, so this waits
// for it (a few seconds at most). `after` skips emails that were already there, e.g. to get a resent link.
export async function setPasswordLink(email: string, { after = 0 }: { after?: number } = {}): Promise<string> {
  const find = () =>
    sentMail()
      .slice(after)
      .filter((mail) => mail.to === email && mail.link?.includes('/set-password?token='))
      .at(-1)?.link
  await expect.poll(find, { message: `a set-password email to ${email}`, timeout: 10_000 }).toBeTruthy()
  return find()!
}
