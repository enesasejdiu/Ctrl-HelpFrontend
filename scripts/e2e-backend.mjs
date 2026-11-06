// e2e-backend.mjs – runs the backend for e2e tests against a throwaway test database. Never uses the dev database:
// all settings come from e2e/.env.test, passed to the backend through DOTENV_PATH so its own .env is not read.
//
//   node scripts/e2e-backend.mjs start     test DB up → wipe + migrate + seed → backend on PORT (used by Playwright)
//   node scripts/e2e-backend.mjs db:up     only start the test DB (stays running in the background)
//   node scripts/e2e-backend.mjs db:down   stop the test DB and delete its data
//   node scripts/e2e-backend.mjs reset     wipe + migrate + seed a running test DB
//
// Locally the test DB is a separate MariaDB server started from XAMPP's binaries, with its own data folder
// (e2e/.db/data, recreated on every start). On CI, set E2E_DB_EXTERNAL=1 and provide the DB as a service container.
//
// Env vars: BACKEND_DIR (default ../Ctrl-HelpBackend), E2E_DB_EXTERNAL=1, E2E_MYSQL_BIN (default C:\xampp\mysql\bin)
import { execFileSync, spawn } from 'node:child_process'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { ENV_FILE, ROOT, loadTestEnv } from './e2e-env.mjs'

const command = process.argv[2] || 'start'
const env = loadTestEnv()
const BACKEND_DIR = path.resolve(ROOT, process.env.BACKEND_DIR || '../Ctrl-HelpBackend')
const EXTERNAL_DB = process.env.E2E_DB_EXTERNAL === '1'
const MYSQL_BIN = process.env.E2E_MYSQL_BIN || 'C:\\xampp\\mysql\\bin'
const DB_DIR = path.join(ROOT, 'e2e', '.db')
const DATA_DIR = path.join(DB_DIR, 'data')

const log = (message) => console.log(`[e2e-backend] ${message}`)
function fail(message) {
  console.error(`[e2e-backend] ${message}`)
  process.exit(1)
}

// --- Safety checks: refuse anything that could reach the dev database -------------------------------------
if (!/test/i.test(env.DB_NAME || '')) {
  fail(`Refusing to run: DB_NAME "${env.DB_NAME}" in ${ENV_FILE} must contain "test".`)
}
if (Number(env.DB_PORT) === 3306 && !EXTERNAL_DB) {
  fail('Refusing to run: DB_PORT 3306 is the dev MySQL server. The e2e database runs on its own port (3307).')
}
if (!fs.existsSync(path.join(BACKEND_DIR, 'src', 'server.js'))) {
  fail(`Backend not found at ${BACKEND_DIR}. Set BACKEND_DIR to the Ctrl-HelpBackend folder.`)
}

// The MySQL driver comes from the backend's own dependencies
const mysql = createRequire(path.join(BACKEND_DIR, 'package.json'))('mysql2/promise')

// Every backend process gets the test settings, and DOTENV_PATH makes dotenv load .env.test instead of .env
const backendEnv = { ...process.env, ...env, NODE_ENV: 'test', DOTENV_PATH: ENV_FILE }

const connect = () =>
  mysql.createConnection({
    host: env.DB_HOST,
    port: Number(env.DB_PORT),
    user: env.DB_USER,
    password: env.DB_PASSWORD,
  })

// The running server's data folder, or null when nothing accepts connections
async function runningDataDir() {
  try {
    const connection = await connect()
    const [[row]] = await connection.query('SELECT @@datadir AS datadir')
    await connection.end()
    return row.datadir
  } catch {
    return null
  }
}

const isOurServer = (dataDir) => path.resolve(dataDir).toLowerCase() === path.resolve(DATA_DIR).toLowerCase()

async function waitFor(check, timeoutMs, what) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await check()) return
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  fail(`Timed out waiting for ${what}.`)
}

// --- Test database --------------------------------------------------------------------------------------------

// Starts a fresh test DB server. Returns its process when this script owns it (so it stops with us), else null.
async function dbUp({ background }) {
  if (EXTERNAL_DB) {
    log(`Using the external test DB at ${env.DB_HOST}:${env.DB_PORT}`)
    await waitFor(async () => (await runningDataDir()) !== null, 60_000, 'the external test DB')
    return null
  }

  const dataDir = await runningDataDir()
  if (dataDir) {
    if (isOurServer(dataDir)) {
      log(`Reusing the test DB already running on port ${env.DB_PORT}`)
      return null
    }
    fail(`Port ${env.DB_PORT} is used by another MySQL server (data in ${dataDir}). Stop it or change DB_PORT.`)
  }
  if (process.platform !== 'win32') {
    fail('Starting the test DB is only automated on Windows (XAMPP). Start MySQL/MariaDB yourself and set E2E_DB_EXTERNAL=1.')
  }

  // A brand-new data folder every time: nothing survives from an earlier run
  fs.rmSync(DATA_DIR, { recursive: true, force: true })
  fs.mkdirSync(DB_DIR, { recursive: true })
  log(`Creating a fresh test DB server in ${path.relative(ROOT, DATA_DIR)}`)
  execFileSync(
    path.join(MYSQL_BIN, 'mysql_install_db.exe'),
    [`--datadir=${DATA_DIR}`, `--port=${env.DB_PORT}`, '--socket=ticketflow_e2e', '--silent'],
    { stdio: 'inherit' },
  )

  const logFile = fs.openSync(path.join(DB_DIR, 'mysqld.log'), 'w')
  const server = spawn(
    path.join(MYSQL_BIN, 'mysqld.exe'),
    [`--defaults-file=${path.join(DATA_DIR, 'my.ini')}`, '--bind-address=127.0.0.1', '--console'],
    { stdio: ['ignore', logFile, logFile], detached: background, windowsHide: true },
  )
  if (background) server.unref()

  await waitFor(async () => (await runningDataDir()) !== null, 30_000, 'the test DB (see e2e/.db/mysqld.log)')
  log(`Test DB is accepting connections on port ${env.DB_PORT}`)
  return background ? null : server
}

async function dbDown() {
  if (EXTERNAL_DB) {
    log('External test DB: nothing to stop (the CI service container is removed with the job).')
    return
  }
  const dataDir = await runningDataDir()
  if (dataDir && !isOurServer(dataDir)) {
    fail(`Refusing to stop the server on port ${env.DB_PORT}: it isn't the e2e test DB (data in ${dataDir}).`)
  }
  if (dataDir) {
    const connection = await connect()
    await connection.query('SHUTDOWN')
    await connection.end()
    await waitFor(async () => (await runningDataDir()) === null, 30_000, 'the test DB to stop')
    log('Test DB stopped')
  } else {
    log('Test DB is not running')
  }
  // The server may hold file locks for a moment after shutting down
  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      fs.rmSync(DATA_DIR, { recursive: true, force: true })
      return
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
  }
  log(`Could not delete ${DATA_DIR}; it is recreated on the next start anyway`)
}

// Drops the test database, then builds it with the backend's own migrations and seed (the known baseline)
async function resetDb() {
  const connection = await connect()
  await connection.query(`DROP DATABASE IF EXISTS \`${env.DB_NAME}\``)
  await connection.end()
  log(`Dropped "${env.DB_NAME}"; running migrations and seed`)

  const runBackendScript = (script) =>
    execFileSync(process.execPath, [script], { cwd: BACKEND_DIR, env: backendEnv, stdio: 'inherit' })
  runBackendScript('scripts/migrate.js')
  runBackendScript('scripts/seed.js')
}

// --- Commands -----------------------------------------------------------------------------------------------

async function start() {
  const db = await dbUp({ background: false })
  await resetDb()

  log(`Starting the backend on port ${env.PORT}`)
  const api = spawn(process.execPath, ['src/server.js'], { cwd: BACKEND_DIR, env: backendEnv, stdio: 'inherit' })

  // Teardown: stopping this script (Playwright does it after the run, or Ctrl+C) stops the backend and the DB
  const stop = () => {
    api.kill()
    db?.kill()
  }
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)
  api.on('exit', (code) => {
    db?.kill()
    process.exit(code ?? 0)
  })
}

const commands = {
  start,
  'db:up': () => dbUp({ background: true }),
  'db:down': dbDown,
  reset: resetDb,
}

if (!commands[command]) fail(`Unknown command "${command}". Use one of: ${Object.keys(commands).join(', ')}`)
await commands[command]()
