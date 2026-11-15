// Runs Vitest several times in a row and stops at the first failing run: a check that the paging tests pass reliably.
//   npm run test:repeat                                   the paging tests (lists, Users page, helpers), 3 times
//   node scripts/repeat-tests.mjs 5 src/pages/Users.test.jsx   any tests, any number of times
import { spawnSync } from 'node:child_process'
import path from 'node:path'

const DEFAULT_TESTS = ['src/pages/TicketList.test.jsx', 'src/pages/Users.test.jsx', 'src/utils/pagination.test.js']

const [timesArg, ...files] = process.argv.slice(2)
const times = Number(timesArg) || 3
const vitest = path.join(import.meta.dirname, '..', 'node_modules', 'vitest', 'vitest.mjs')

for (let run = 1; run <= times; run += 1) {
  console.log(`\n[repeat] Run ${run} of ${times}`)
  const result = spawnSync(process.execPath, [vitest, 'run', ...(files.length ? files : DEFAULT_TESTS)], {
    stdio: 'inherit',
  })
  if (result.status !== 0) {
    console.error(`[repeat] Run ${run} of ${times} failed`)
    process.exit(result.status ?? 1)
  }
}
console.log(`\n[repeat] All ${times} runs passed`)
