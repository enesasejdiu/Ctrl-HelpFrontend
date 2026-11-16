// users.ts – the accounts tests sign in as, and where their saved logins live.
//   local run: the seeded accounts (backend scripts/seed.js, password123), in this run's throwaway database
//   staging:   the admin from STAGING_ADMIN_EMAIL / STAGING_ADMIN_PASSWORD, and an employee and an agent this run
//              created through the API (global-setup.staging.ts; e2e-<runId>-…@example.test)
// Passwords are only ever read here; never print them.
import fs from 'node:fs'
import path from 'node:path'
import { STAGING, STAGING_ACCOUNTS_FILE } from './target'

export type Role = 'admin' | 'agent' | 'user'
export type Account = { email: string; password: string; name: string }

const SEEDED_PASSWORD = 'password123'
const SEEDED: Record<Role, Account> = {
  admin: { email: 'admin@ticketflow.local', name: 'Admin User', password: SEEDED_PASSWORD },
  agent: { email: 'agent1@ticketflow.local', name: 'Arben Krasniqi', password: SEEDED_PASSWORD },
  user: { email: 'employee1@ticketflow.local', name: 'Liridon Gashi', password: SEEDED_PASSWORD },
}

let stagingAccounts: Partial<Record<Role, Account>> | undefined

// The account for a role on this run's target
export function account(role: Role): Account {
  if (!STAGING) return SEEDED[role]
  if (role === 'admin') {
    return {
      email: process.env.STAGING_ADMIN_EMAIL as string,
      password: process.env.STAGING_ADMIN_PASSWORD as string,
      name: 'Staging admin',
    }
  }
  stagingAccounts ??= JSON.parse(fs.readFileSync(STAGING_ACCOUNTS_FILE as string, 'utf8'))
  const found = stagingAccounts?.[role]
  if (!found) throw new Error(`No ${role} account for this staging run (global-setup.staging.ts makes them)`)
  return found
}

// storageState files written by the global setup; use with test.use({ storageState: authFile('user') })
export const authFile = (role: 'admin' | 'user') =>
  path.join(import.meta.dirname, '..', '.auth', `${STAGING ? 'staging-' : ''}${role}.json`)
