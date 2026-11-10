// returnPath.test.js – only paths on this site are accepted as the page to return to after logging in.
import { returnPathFrom, safeReturnPath } from './returnPath'

describe('safeReturnPath', () => {
  it.each(['/tickets', '/tickets/7?status=open', '/tickets/7#comments', '/admin/users?role=hr&page=2'])(
    'keeps %s',
    (path) => {
      expect(safeReturnPath(path)).toBe(path)
    },
  )

  it.each([
    ['another site', 'https://evil.example/tickets'],
    ['a protocol-relative address', '//evil.example'],
    ['a backslash', '/\\evil.example'],
    ['a tab trick', '/\t/evil.example'],
    ['a javascript: URL', 'javascript:alert(1)'],
    ['a relative path', 'tickets'],
    ['the login page', '/login'],
    ['the login page with a query', '/login?reason=session_expired'],
    ['nothing', ''],
    ['a non-string', { pathname: '/tickets' }],
  ])('refuses %s', (_case, path) => {
    expect(safeReturnPath(path)).toBeNull()
  })
})

describe('returnPathFrom', () => {
  it('joins the saved location', () => {
    expect(returnPathFrom({ pathname: '/tickets', search: '?status=open', hash: '#top' })).toBe(
      '/tickets?status=open#top',
    )
  })

  it('returns null without a saved location, or with an unsafe one', () => {
    expect(returnPathFrom(undefined)).toBeNull()
    expect(returnPathFrom({})).toBeNull()
    expect(returnPathFrom({ pathname: '//evil.example' })).toBeNull()
  })
})
