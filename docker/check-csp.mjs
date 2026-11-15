// Opens the built app in Chromium, through the running container (with its real Content-Security-Policy), and reports
// every CSP violation and console error. Used by CI after docker/verify.sh (the docker job); exits non-zero when the
// policy blocked anything, so a change that needs a looser policy shows up as a red check instead of a blank page.
//
//   node docker/check-csp.mjs http://localhost:8080
//
// The stub backend answers 401 to everything, so the app shows the signed-out pages; the 401s themselves are expected.
import { chromium } from '@playwright/test'

const base = process.argv[2] ?? 'http://localhost:8080'
// Signed-out pages, and a signed-in one that sends the visitor to sign-in (the app's code runs on every one)
const PAGES = ['/login', '/forgot-password', '/set-password?token=abc', '/tickets/5', '/no-such-page']

const browser = await chromium.launch()
const problems = []
try {
  for (const path of PAGES) {
    const page = await browser.newPage()
    // The browser fires securitypolicyviolation for everything the policy blocks
    await page.addInitScript(() => {
      document.addEventListener('securitypolicyviolation', (event) => {
        console.error(`CSP violation: ${event.violatedDirective} blocked ${event.blockedURI || '(inline)'}`)
      })
    })
    page.on('console', (message) => {
      const text = message.text()
      // A signed-out visitor's 401 from /api/auth/me is how the app finds out it isn't logged in
      if (message.type() === 'error' && !/status of 401/.test(text)) problems.push(`${path}: ${text}`)
    })
    page.on('pageerror', (error) => problems.push(`${path}: ${error.message}`))
    await page.goto(base + path, { waitUntil: 'networkidle' })
    const heading = await page
      .locator('h1')
      .first()
      .textContent({ timeout: 5000 })
      .catch(() => null)
    if (!heading) problems.push(`${path}: the app didn't render (no heading)`)
    console.log(`  ${path} → ${page.url().replace(base, '')}: "${heading?.trim()}"`)
    await page.close()
  }
} finally {
  await browser.close()
}

if (problems.length > 0) {
  console.error(`\n${problems.length} problem(s) with the Content-Security-Policy or the page:`)
  for (const problem of problems) console.error(`  ${problem}`)
  process.exit(1)
}
console.log('\nNo CSP violations and no console errors.')
