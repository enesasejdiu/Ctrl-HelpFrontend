// global-setup.ts – logs in once per seeded role and saves the session as a storageState file, so tests start logged
// in without going through the login form every time. (Local runs; staging: global-setup.staging.ts.)
// The session is the backend's cookies (tf_session, httpOnly, and tf_csrf), so that's all the file holds; the app
// keeps nothing in localStorage. Logging in through the frontend's /api proxy gives the cookies exactly as a browser
// on the app gets them.
// If it fails, this run's database is dropped here, because the global teardown may not run then.
import { execFileSync } from 'node:child_process'
import { saveLogins } from './support/logins'

export default async function globalSetup() {
  try {
    await saveLogins()
  } catch (err) {
    execFileSync(process.execPath, ['scripts/e2e-backend.mjs', 'drop'], { stdio: 'inherit' })
    throw err
  }
}
