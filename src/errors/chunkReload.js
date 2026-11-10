// chunkReload.js – after a deploy, an open tab still runs the old build and asks for code files (chunks) that no
// longer exist. Reloading once fetches the new build. A timestamp in sessionStorage makes sure that happens at most once
// per CHUNK_RELOAD_WINDOW_MS: if the chunk still fails after the reload, the fallback page is shown instead of looping.
// The only thing kept in sessionStorage is that timestamp (no auth data; see test/no-token-storage.test.js).
import { browser } from '../utils/browser'

export const CHUNK_RELOAD_KEY = 'ticketflow.chunkReloadAt'
export const CHUNK_RELOAD_WINDOW_MS = 5 * 60 * 1000

// The messages browsers and bundlers use when a dynamic import or its CSS fails to load
const CHUNK_ERROR =
  /Loading (CSS )?chunk [\w-]+ failed|Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS/i

export function isChunkLoadError(error) {
  if (!error) return false
  if (error.name === 'ChunkLoadError') return true
  return CHUNK_ERROR.test(typeof error === 'string' ? error : String(error.message ?? ''))
}

// When the last automatic reload happened (0 = never), or null if sessionStorage can't be used
function lastReloadAt() {
  try {
    return Number(sessionStorage.getItem(CHUNK_RELOAD_KEY)) || 0
  } catch {
    return null
  }
}

// Read-only: may we reload now? Not without storage (nothing would stop a loop), and not again within the window.
// A timestamp in the future (the clock was turned back) doesn't block reloads forever.
export function chunkReloadAllowed(now = Date.now()) {
  const last = lastReloadAt()
  if (last === null) return false
  return now - last > CHUNK_RELOAD_WINDOW_MS || now < last
}

// Notes the reload, then reloads. Returns false (and doesn't reload) if the note can't be stored.
export function reloadForChunkError() {
  try {
    sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()))
  } catch {
    return false
  }
  browser.reload()
  return true
}
