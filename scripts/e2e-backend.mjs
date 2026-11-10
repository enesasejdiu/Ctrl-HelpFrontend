// e2e-backend.mjs – the backend for e2e tests, on a throwaway database of its own. The real database is never used:
// the database name comes from scripts/e2e-env.mjs (ticketflow_e2e_<timestamp>_<pid>) and every command refuses to
// run unless it starts with "ticketflow_e2e_". Works on MySQL 8/9 and on MariaDB (XAMPP).
//
//   node scripts/e2e-backend.mjs start         create the database, migrate + seed it, run the backend (Playwright)
//   node scripts/e2e-backend.mjs drop          drop this run's database (global teardown)
//   node scripts/e2e-backend.mjs cleanup       drop every ticketflow_e2e_* database left by crashed runs
//   node scripts/e2e-backend.mjs check-clean   fail if any ticketflow_e2e_* database is left
//
// Env vars: BACKEND_DIR (default ../Ctrl-HelpBackend), E2E_DB_HOST / E2E_DB_PORT / E2E_DB_USER / E2E_DB_PASSWORD
// (default: the server in the backend's .env).
import { execFileSync, spawn } from 'node:child_process'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import {
  API_PORT,
  BACKEND_DIR,
  DB_NAME,
  DB_SERVER,
  E2E_DB_PREFIX,
  FRONTEND_URL,
  TEST_SETTINGS,
  assertE2eDbName,
} from './e2e-env.mjs'

const command = process.argv[2] || 'start'
// A database left by a crashed run is dropped by the next start once it is this old (a running suite is younger)
const STALE_AFTER_MS = 6 * 60 * 60 * 1000

const log = (message) => console.log(`[e2e-backend] ${message}`)
function fail(message) {
  console.error(`[e2e-backend] ${message}`)
  process.exit(1)
}

if (!fs.existsSync(path.join(BACKEND_DIR, 'src', 'server.js'))) {
  fail(`Backend not found at ${BACKEND_DIR}. Set BACKEND_DIR to the Ctrl-HelpBackend folder.`)
}
assertE2eDbName(DB_NAME)

// The MySQL driver comes from the backend's own dependencies
const mysql = createRequire(path.join(BACKEND_DIR, 'package.json'))('mysql2/promise')
const connect = () => mysql.createConnection(DB_SERVER)

// Every backend process gets only test settings. They are set explicitly, so the backend's own .env (which dotenv
// still reads) can't fill in anything that matters, least of all DB_NAME.
const backendEnv = {
  ...process.env,
  ...TEST_SETTINGS,
  NODE_ENV: 'test',
  PORT: String(API_PORT),
  DB_HOST: DB_SERVER.host,
  DB_PORT: String(DB_SERVER.port),
  DB_USER: DB_SERVER.user,
  DB_PASSWORD: DB_SERVER.password,
  DB_NAME,
  CLIENT_URL: FRONTEND_URL,
  DOTENV_CONFIG_QUIET: 'true',
}

async function e2eDatabases(connection) {
  const [rows] = await connection.query('SHOW DATABASES')
  return rows.map((row) => Object.values(row)[0]).filter((name) => name.startsWith(E2E_DB_PREFIX))
}

async function dropDatabase(connection, name) {
  assertE2eDbName(name)
  await connection.query(`DROP DATABASE IF EXISTS \`${name}\``)
}

// Drops this run's database. Safe to call more than once.
async function drop() {
  const connection = await connect()
  try {
    await dropDatabase(connection, DB_NAME)
    log(`Dropped "${DB_NAME}"`)
  } finally {
    await connection.end()
  }
}

// Drops e2e databases older than STALE_AFTER_MS (all of them with { all: true })
async function cleanup({ all = false } = {}) {
  const connection = await connect()
  try {
    for (const name of await e2eDatabases(connection)) {
      const createdAt = Number(name.slice(E2E_DB_PREFIX.length).split('_')[0])
      if (all || !createdAt || Date.now() - createdAt > STALE_AFTER_MS) {
        await dropDatabase(connection, name)
        log(`Dropped leftover "${name}"`)
      }
    }
  } finally {
    await connection.end()
  }
}

async function checkClean() {
  const connection = await connect()
  try {
    const left = await e2eDatabases(connection)
    if (left.length) fail(`e2e databases left behind: ${left.join(', ')}`)
    log('No e2e databases left')
  } finally {
    await connection.end()
  }
}

async function start() {
  await cleanup()
  log(`Database "${DB_NAME}" on ${DB_SERVER.host}:${DB_SERVER.port}: migrating and seeding`)
  // migrate.js creates the database; seed.js --force fills it (it is brand new, so there is nothing to lose)
  const runBackendScript = (...args) =>
    execFileSync(process.execPath, args, { cwd: BACKEND_DIR, env: backendEnv, stdio: 'inherit' })
  runBackendScript('scripts/migrate.js')
  runBackendScript('scripts/seed.js', '--force')

  log(`Starting the backend on port ${API_PORT}`)
  const api = spawn(process.execPath, ['src/server.js'], { cwd: BACKEND_DIR, env: backendEnv, stdio: 'inherit' })

  // Ctrl+C or a normal stop: stop the backend and drop the database. (Playwright may kill this process outright,
  // e.g. on Windows; the global teardown drops the database in that case.)
  let stopping = false
  const stop = async () => {
    if (stopping) return
    stopping = true
    api.kill()
    await drop().catch((err) => log(`Could not drop "${DB_NAME}": ${err.message}`))
    process.exit(0)
  }
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)
  api.on('exit', (code) => {
    if (!stopping) fail(`The backend stopped unexpectedly (exit code ${code})`)
  })
}

const commands = {
  start,
  drop,
  cleanup: () => cleanup({ all: true }),
  'check-clean': checkClean,
}

if (!commands[command]) fail(`Unknown command "${command}". Use one of: ${Object.keys(commands).join(', ')}`)
// A refused connection is an AggregateError with an empty message; its inner errors say what failed
const describeError = (err) =>
  err.message || err.errors?.map((inner) => inner.message).join('; ') || err.code || String(err)
await commands[command]().catch((err) =>
  fail(`${describeError(err)}${err.code === 'ECONNREFUSED' ? ' (is the database server running?)' : ''}`),
)
