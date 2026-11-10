// e2e-temporary-passwords.mjs – runs the e2e tests with the backend in temporary-password mode (email not set up):
// only e2e/temporary-passwords.spec.ts, on a throwaway database of its own like every run. Extra arguments go to
// Playwright, e.g. npm run e2e:temporary-passwords -- --project=chromium
import { spawnSync } from 'node:child_process'

const result = spawnSync('npx', ['playwright', 'test', ...process.argv.slice(2)], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, E2E_PASSWORD_DELIVERY: 'temporary_password' },
})
process.exit(result.status ?? 1)
