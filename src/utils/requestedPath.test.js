// requestedPath.test.js – the path the "Page not found" page shows, and whether "Go back" stays in the app.
import { MAX_PATH_LENGTH, displayPath, hasInAppHistory } from './requestedPath'

describe('displayPath', () => {
  it.each([
    ['/admin/usres', '/admin/usres'],
    ['/%3Cscript%3E', '/<script>'],
    ['/caf%C3%A9', '/café'],
    ['/bad%E0%A4%A', '/bad%E0%A4%A'], // malformed escape: as it is
    ['/a%0Ab%00c', '/abc'], // control characters dropped
    ['', ''],
  ])('%s → %s', (input, shown) => {
    expect(displayPath(input)).toBe(shown)
  })

  it(`cuts long paths to ${MAX_PATH_LENGTH} characters, without splitting a character`, () => {
    expect(displayPath(`/${'a'.repeat(99)}`)).toHaveLength(100) // exactly the limit: unchanged
    const long = displayPath(`/${'😀'.repeat(150)}`)
    expect(Array.from(long)).toHaveLength(MAX_PATH_LENGTH)
    expect(long.endsWith('😀…')).toBe(true)
  })
})

describe('hasInAppHistory', () => {
  afterEach(() => window.history.replaceState(null, ''))

  it.each([
    [null, false],
    [{}, false],
    [{ idx: 0 }, false],
    [{ idx: 2 }, true],
    [{ idx: '2' }, false],
  ])('history.state %j → %s', (state, expected) => {
    window.history.replaceState(state, '')
    expect(hasInAppHistory()).toBe(expected)
  })
})
