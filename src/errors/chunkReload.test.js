// chunkReload.test.js – recognising chunk load errors, and reloading at most once per window.
import { browser } from '../utils/browser'
import {
  CHUNK_RELOAD_KEY,
  CHUNK_RELOAD_WINDOW_MS,
  chunkReloadAllowed,
  isChunkLoadError,
  reloadForChunkError,
} from './chunkReload'

describe('isChunkLoadError', () => {
  it.each([
    ['webpack-style', new Error('Loading chunk 42 failed.')],
    ['a CSS chunk', new Error('Loading CSS chunk admin-dashboard failed')],
    ['Chrome', new TypeError('Failed to fetch dynamically imported module: https://app.example/assets/Admin-1a2b.js')],
    ['Firefox', new TypeError('error loading dynamically imported module: https://app.example/assets/Admin-1a2b.js')],
    ['Safari', new TypeError('Importing a module script failed.')],
    ['Vite CSS preload', new Error('Unable to preload CSS for /assets/Admin-1a2b.css')],
    ['by name', Object.assign(new Error('whatever'), { name: 'ChunkLoadError' })],
    ['a plain string', 'Failed to fetch dynamically imported module: /x.js'],
  ])('recognises %s', (_case, error) => {
    expect(isChunkLoadError(error)).toBe(true)
  })

  it.each([
    ['an ordinary error', new Error("Cannot read properties of undefined (reading 'name')")],
    ['a failed API request', new Error('Network Error')],
    ['undefined', undefined],
    ['an object without a message', {}],
  ])('ignores %s', (_case, error) => {
    expect(isChunkLoadError(error)).toBe(false)
  })
})

describe('reloading once', () => {
  let reload
  beforeEach(() => {
    reload = vi.spyOn(browser, 'reload').mockImplementation(() => {})
  })

  it('allows the first reload, stores when it happened, and reloads', () => {
    expect(chunkReloadAllowed()).toBe(true)
    expect(reloadForChunkError()).toBe(true)
    expect(reload).toHaveBeenCalledTimes(1)
    expect(Number(sessionStorage.getItem(CHUNK_RELOAD_KEY))).toBeGreaterThan(0)
  })

  it('refuses another reload within the window, and allows one after it', () => {
    const now = Date.now()
    sessionStorage.setItem(CHUNK_RELOAD_KEY, String(now - 60_000))
    expect(chunkReloadAllowed(now)).toBe(false)
    sessionStorage.setItem(CHUNK_RELOAD_KEY, String(now - CHUNK_RELOAD_WINDOW_MS - 1))
    expect(chunkReloadAllowed(now)).toBe(true)
  })

  it('a timestamp in the future (clock turned back) does not block reloads forever', () => {
    const now = Date.now()
    sessionStorage.setItem(CHUNK_RELOAD_KEY, String(now + 60_000))
    expect(chunkReloadAllowed(now)).toBe(true)
  })

  it('without usable sessionStorage it never reloads, since nothing could stop a loop', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    expect(chunkReloadAllowed()).toBe(false)
    expect(reloadForChunkError()).toBe(false)
    expect(reload).not.toHaveBeenCalled()
  })
})
