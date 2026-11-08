// users.ts – the seeded accounts (backend scripts/seed.js) and where their saved logins live.
import path from 'node:path'

export const PASSWORD = 'password123'

export const USERS = {
  admin: { email: 'admin@ticketflow.local', name: 'Admin User' },
  agent: { email: 'agent1@ticketflow.local', name: 'Arben Krasniqi' },
  user: { email: 'employee1@ticketflow.local', name: 'Liridon Gashi' },
} as const

export type Role = keyof typeof USERS

// storageState files written by global-setup.ts; use with test.use({ storageState: authFile('user') })
export const authFile = (role: 'admin' | 'user') => path.join(import.meta.dirname, '..', '.auth', `${role}.json`)
