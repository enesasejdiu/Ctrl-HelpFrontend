// global-setup.deployed.ts – npm run e2e:deployed: empties the stack's Mailpit inbox (so this run only sees its own
// emails) and saves the seed accounts' logins, like the local run. Nothing is created or dropped: the stack is
// disposable and was seeded for the run (Ctrl-HelpBackend docs/staging-check.md).
import { clearMailpit } from './support/mail'
import { saveLogins } from './support/logins'

export default async function globalSetup() {
  await clearMailpit()
  await saveLogins()
}
