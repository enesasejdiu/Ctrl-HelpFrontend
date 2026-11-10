// wait.test.js – reading Retry-After and showing the time left.
import { formatWait, retryAfterSeconds } from './wait'

describe('retryAfterSeconds', () => {
  it('reads seconds', () => {
    expect(retryAfterSeconds({ headers: { 'retry-after': '90' } })).toBe(90)
  })

  it('reads an HTTP date', () => {
    const inTwoMinutes = new Date(Date.now() + 120_000).toUTCString()
    expect(retryAfterSeconds({ headers: { 'retry-after': inTwoMinutes } })).toBeGreaterThanOrEqual(119)
  })

  it.each([undefined, '', '0', 'soon', new Date(Date.now() - 60_000).toUTCString()])('gives null for %j', (value) => {
    expect(retryAfterSeconds({ headers: { 'retry-after': value } })).toBeNull()
  })

  it('gives null without a response', () => {
    expect(retryAfterSeconds(undefined)).toBeNull()
  })
})

describe('formatWait', () => {
  it.each([
    [0, '0:00'],
    [1, '0:01'],
    [59_001, '1:00'],
    [90_000, '1:30'],
    [300_000, '5:00'],
    [300_001, 'about 6 minutes'],
    [15 * 60_000, 'about 15 minutes'],
    [-5_000, '0:00'],
  ])('%i ms → %s', (ms, text) => {
    expect(formatWait(ms)).toBe(text)
  })
})
