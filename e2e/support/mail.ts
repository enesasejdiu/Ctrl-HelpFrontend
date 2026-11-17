// mail.ts – the emails this run's backend "sent". The e2e backend runs with NODE_ENV=test, so nothing leaves the
// machine: every email is saved as a .json file in MAIL_OUTBOX_DIR instead (see scripts/e2e-backend.mjs), and these
// helpers read them, e.g. to open a new account's set-password link.
// Against a deployed stack (npm run e2e:deployed) the emails really go out over SMTP, to its Mailpit test inbox; the same
// helpers read them from Mailpit's API instead.
import { expect } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { DEPLOYED, MAILPIT_URL } from './target'

// The local run's mail folder; only loaded for a local run (a deployed run has no local settings to read)
const MAIL_OUTBOX_DIR: string = DEPLOYED ? '' : (await import('../../scripts/e2e-env.mjs')).MAIL_OUTBOX_DIR

export type SentMail = { to: string; subject: string; text: string; html: string; link?: string }

// Every email sent so far, oldest first (file names start with the time they were written)
export function sentMail(): SentMail[] {
  if (DEPLOYED) return mailpitMail()
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

// ---- Mailpit (npm run e2e:deployed) ----

// Mailpit's messages, oldest first, in the outbox's shape; the link is the set-password link in the text, as the
// backend's outbox records it. Synchronous like the outbox (specs call sentMail() in polls), so it asks Mailpit in a
// short child process; each message is fetched once and remembered.
const mailpitCache = new Map<string, SentMail>()
const LINK = /https?:\/\/\S+\/set-password\?token=[A-Za-z0-9_-]+/

const MAILPIT_SCRIPT = `
const [base, known] = [process.argv[1], new Set(JSON.parse(process.argv[2]))]
;(async () => {
  const list = await (await fetch(base + '/api/v1/messages?limit=1000')).json()
  const out = []
  for (const summary of list.messages ?? []) {
    if (known.has(summary.ID)) { out.push({ id: summary.ID }); continue }
    const m = await (await fetch(base + '/api/v1/message/' + summary.ID)).json()
    out.push({ id: summary.ID, to: m.To?.[0]?.Address ?? '', subject: m.Subject ?? '', text: m.Text ?? '', html: m.HTML ?? '' })
  }
  process.stdout.write(JSON.stringify(out))
})().catch((err) => { process.stderr.write(String(err)); process.exit(1) })`

function mailpitMail(): SentMail[] {
  const raw = execFileSync(
    process.execPath,
    ['-e', MAILPIT_SCRIPT, MAILPIT_URL!, JSON.stringify([...mailpitCache.keys()])],
    {
      encoding: 'utf8',
    },
  )
  const newestFirst = JSON.parse(raw) as Array<{ id: string } & Partial<SentMail>>
  return newestFirst.reverse().map(({ id, ...mail }) => {
    if (!mailpitCache.has(id)) {
      const full = mail as SentMail
      mailpitCache.set(id, { ...full, link: full.text.match(LINK)?.[0] })
    }
    return mailpitCache.get(id)!
  })
}

// Empties the Mailpit inbox (global-setup.deployed.ts), so a run only sees its own emails
export async function clearMailpit(): Promise<void> {
  const response = await fetch(`${MAILPIT_URL}/api/v1/messages`, { method: 'DELETE' })
  if (!response.ok) throw new Error(`Could not empty the Mailpit inbox at ${MAILPIT_URL} (${response.status})`)
  mailpitCache.clear()
}
