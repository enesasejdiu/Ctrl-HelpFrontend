// global-teardown.ts – drops this run's throwaway database after all tests, also when tests failed.
// Playwright stops the backend and frontend servers itself. (The backend script also drops the database when it's
// stopped normally; this covers the case where it's killed outright, e.g. on Windows.)
import { execFileSync } from 'node:child_process'

export default async function globalTeardown() {
  execFileSync(process.execPath, ['scripts/e2e-backend.mjs', 'drop'], { stdio: 'inherit' })
}
