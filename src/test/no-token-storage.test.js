// no-token-storage.test.js – a guard over the app's source: sessions are httpOnly cookies, so no code may keep auth data
// in web storage, send an Authorization header, or read the token from the login response. Fails the test run (and CI)
// if any of that comes back.
import fs from 'node:fs'
import path from 'node:path'

const SRC = path.resolve(import.meta.dirname, '..')

// Every app file under src/, without tests and test helpers
function sourceFiles(dir = SRC) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === 'test' || entry.name === 'node_modules' ? [] : sourceFiles(full)
    return /\.(js|jsx)$/.test(entry.name) && !/\.test\.(js|jsx)$/.test(entry.name) ? [full] : []
  })
}

// The one place allowed to touch storage: deleting the session older versions saved (see the file's TODO)
const STORAGE_ALLOWED = ['context/legacySession.js']
// Keeps one timestamp in sessionStorage, so a failed code download after a deploy reloads the page only once
const CHUNK_RELOAD = 'errors/chunkReload.js'
// Keeps a copy of a knowledge-base article being written in localStorage (article text only), for after a crash
const KB_DRAFT_BACKUP = 'pages/kb/draftBackup.js'

// Comments are left out, so explaining what the code doesn't do doesn't trip the check
const code = (file) =>
  fs
    .readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
const relative = (file) => path.relative(SRC, file).split(path.sep).join('/')
const offenders = (pattern, allowed = []) =>
  sourceFiles()
    .filter((file) => !allowed.includes(relative(file)) && pattern.test(code(file)))
    .map(relative)

describe('no token on the client', () => {
  it('finds the app source (so the checks below really ran)', () => {
    expect(sourceFiles().map(relative)).toEqual(expect.arrayContaining(['api/client.js', 'context/AuthContext.jsx']))
  })

  it('no code uses localStorage or sessionStorage (auth lives in an httpOnly cookie)', () => {
    expect(offenders(/\b(localStorage|sessionStorage)\b/, [...STORAGE_ALLOWED, CHUNK_RELOAD, KB_DRAFT_BACKUP])).toEqual(
      [],
    )
  })

  it('the knowledge-base draft backup keeps only article drafts, under its own keys, in localStorage', () => {
    const backup = code(path.join(SRC, KB_DRAFT_BACKUP))
    // Nothing about the session, and never sessionStorage
    expect(backup).not.toMatch(/token|user|session|cookie|auth|csrf|password/i)
    // Every key it reads, writes or removes is built by keyFor(), from its own prefix
    expect(backup.match(/localStorage\.\w+\(\s*[^)]*/g)).toEqual([
      'localStorage.getItem(keyFor(id',
      'localStorage.setItem(keyFor(id',
      'localStorage.removeItem(keyFor(id',
    ])
    expect(backup).toMatch(/DRAFT_BACKUP_PREFIX = 'kb-editor-backup:'/)
    expect(backup).toMatch(/const keyFor = \(id\) => `\$\{DRAFT_BACKUP_PREFIX\}\$\{id\}`/)
  })

  it('the chunk-reload guard keeps only its timestamp in sessionStorage, and nothing in localStorage', () => {
    const guard = code(path.join(SRC, CHUNK_RELOAD))
    expect(guard).not.toMatch(/\blocalStorage\b|token|user|session(?!Storage)/i)
    expect(guard.match(/sessionStorage\.\w+\(\s*\w+/g)).toEqual([
      'sessionStorage.getItem(CHUNK_RELOAD_KEY',
      'sessionStorage.setItem(CHUNK_RELOAD_KEY',
    ])
  })

  it('no IndexedDB or other client-side persistence of the session', () => {
    expect(offenders(/\b(indexedDB|persist\(|createJSONStorage)\b/)).toEqual([])
  })

  it('the legacy cleanup only ever removes keys', () => {
    const cleanup = code(path.join(SRC, 'context/legacySession.js'))
    expect(cleanup).toMatch(/localStorage\.removeItem/)
    expect(cleanup).not.toMatch(/\b(?:localStorage|sessionStorage)\.(?:getItem|setItem)|\bsessionStorage\b/)
  })

  it('no code sets an Authorization header or a Bearer token', () => {
    expect(offenders(/Authorization|Bearer/i)).toEqual([])
  })

  it('no code reads the token from a response or decodes a JWT', () => {
    // legacySession.js names the old 'ticketflow.token' key, only to delete it
    expect(offenders(/\.token\b|\{\s*token\b|jwt-decode|jwtDecode|atob\(/, STORAGE_ALLOWED)).toEqual([])
  })
})
