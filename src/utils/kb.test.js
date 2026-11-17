// kb.test.js – the knowledge base's browser-side rules (the same limits as the server) and the search highlighting.
import { highlightParts, searchWords, validateArticle } from './kb'

const valid = { title: 'Reset your password', slug: 'reset', summary: '', body: 'Text', category_id: '1' }

describe('validateArticle', () => {
  test('a complete article has no errors', () => {
    expect(validateArticle(valid)).toEqual({})
  })

  test.each([
    ['an empty title', { title: '  ' }, 'title', 'Title is required'],
    ['a title of 4 characters', { title: 'Four' }, 'title', 'Title must be at least 5 characters'],
    ['a title of 201 characters', { title: 'x'.repeat(201) }, 'title', 'Title can be at most 200 characters'],
    ['a summary of 301 characters', { summary: 'x'.repeat(301) }, 'summary', 'Summary can be at most 300 characters'],
    ['an empty body', { body: '   ' }, 'body', 'The article needs some text'],
    [
      'a body over 100,000 characters',
      { body: 'x'.repeat(100_001) },
      'body',
      'The article can be at most 100,000 characters',
    ],
    ['no category', { category_id: '' }, 'category_id', 'Choose a category'],
  ])('%s', (_, change, field, message) => {
    expect(validateArticle({ ...valid, ...change })).toEqual({ [field]: message })
  })

  test('the limits themselves are fine', () => {
    expect(validateArticle({ ...valid, title: 'Fives', summary: 's'.repeat(300), body: 'b'.repeat(100_000) })).toEqual(
      {},
    )
  })

  test('the slug is only checked when it can be edited, with the server rule', () => {
    expect(validateArticle({ ...valid, slug: 'Bad Slug' })).toEqual({})
    for (const slug of ['Bad', 'two--dashes', '-x', 'x-', 'ë']) {
      expect(validateArticle({ ...valid, slug }, { checkSlug: true }).slug).toMatch(/lowercase letters/)
    }
    expect(validateArticle({ ...valid, slug: '' }, { checkSlug: true }).slug).toBe('Address is required')
    expect(validateArticle({ ...valid, slug: 'a-1-b' }, { checkSlug: true })).toEqual({})
  })
})

describe('search highlighting', () => {
  test('the words of a search: 3+ characters, lowercase, without repeats', () => {
    expect(searchWords('VPN password vpn to fix!')).toEqual(['vpn', 'password', 'fix'])
  })

  test('marks whole words and word starts, in any case', () => {
    expect(highlightParts('VPN passwords for the Vpn', 'vpn password')).toEqual([
      { text: 'VPN', match: true },
      { text: ' ', match: false },
      { text: 'password', match: true },
      { text: 's for the ', match: false },
      { text: 'Vpn', match: true },
    ])
  })

  test('not in the middle of a word', () => {
    expect(highlightParts('openvpn', 'vpn')).toEqual([{ text: 'openvpn', match: false }])
  })

  test('regex characters in the search are just characters', () => {
    expect(highlightParts('a (b) c', '(b) .*')).toEqual([{ text: 'a (b) c', match: false }])
  })

  test('without a search, or with nothing to mark, the text is one plain part', () => {
    expect(highlightParts('Hello', '')).toEqual([{ text: 'Hello', match: false }])
    expect(highlightParts('', 'x')).toEqual([{ text: '', match: false }])
  })
})
