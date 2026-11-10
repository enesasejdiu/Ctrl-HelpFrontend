// i18n.test.js – looking up messages, filling in params, plurals, and React elements as params.
import { t, tNodes } from '.'
import en from './en'

describe('t', () => {
  it('fills in params', () => {
    expect(t('login.locked', { time: '4:59' })).toBe(
      'Too many failed attempts. Your account is locked. Try again in 4:59.',
    )
  })

  it('picks the plural form from count', () => {
    expect(t('time.aboutMinutes', { count: 1 })).toBe('about 1 minute')
    expect(t('time.aboutMinutes', { count: 15 })).toBe('about 15 minutes')
  })

  it('leaves a placeholder without a param as it is', () => {
    expect(t('login.rateLimited')).toBe('Too many attempts. Please wait {time} and try again.')
  })

  it('gives the key back for an unknown key, including names from Object.prototype', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(t('no.such.key')).toBe('no.such.key')
    expect(t('toString')).toBe('toString')
    // ...and says so in development (cleared, since the test setup fails on unexpected console output)
    expect(warn.mock.calls.map(([message]) => message)).toEqual([
      'i18n: no message for "no.such.key"',
      'i18n: no message for "toString"',
    ])
    warn.mockClear()
  })

  it('every message is a non-empty string', () => {
    for (const [key, value] of Object.entries(en)) {
      expect(typeof value, key).toBe('string')
      expect(value.trim(), key).not.toBe('')
    }
  })
})

describe('tNodes', () => {
  it('puts a param (e.g. an element) in place, keeping the text around it', () => {
    const element = { type: 'span' }
    expect(tNodes('login.rateLimited', { time: element })).toEqual([
      'Too many attempts. Please wait ',
      element,
      ' and try again.',
    ])
  })
})
