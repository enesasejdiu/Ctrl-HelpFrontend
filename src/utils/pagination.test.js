// pagination.test.js – reading paging and sorting from the URL, and the small helpers around the paged API answer.
import {
  badRequestDetails,
  fallbackPage,
  pageCount,
  pagedResult,
  pagingQuery,
  rangeLabel,
  readPaging,
  withPaging,
} from './pagination'

const SORTS = ['created_at', 'priority', 'title']
const params = (query) => new URLSearchParams(query)

describe('readPaging', () => {
  it('defaults: page 1, 25 per page, no sort', () => {
    expect(readPaging(params(''), SORTS)).toEqual({ page: 1, pageSize: 25, sort: '', order: '' })
  })

  it('reads valid values', () => {
    expect(readPaging(params('page=3&pageSize=100&sort=priority&order=desc'), SORTS)).toEqual({
      page: 3,
      pageSize: 100,
      sort: 'priority',
      order: 'desc',
    })
  })

  it.each([
    ['page=0', { page: 1 }],
    ['page=-2', { page: 1 }],
    ['page=2.5', { page: 1 }],
    ['page=abc', { page: 1 }],
    ['pageSize=33', { pageSize: 25 }],
    ['pageSize=1000', { pageSize: 25 }],
    ['sort=password_hash', { sort: '', order: '' }],
    ['sort=title&order=sideways', { sort: 'title', order: '' }],
    ['order=desc', { sort: '', order: '' }],
  ])('falls back to the default for an invalid value: %s', (query, expected) => {
    expect(readPaging(params(query), SORTS)).toMatchObject(expected)
  })
})

describe('pagingQuery', () => {
  it('always has page and pageSize; sort and order only when chosen', () => {
    expect(pagingQuery({ page: 1, pageSize: 25, sort: '', order: '' })).toEqual({ page: '1', pageSize: '25' })
    expect(pagingQuery({ page: 2, pageSize: 50, sort: 'title', order: 'asc' })).toEqual({
      page: '2',
      pageSize: '50',
      sort: 'title',
      order: 'asc',
    })
  })
})

describe('withPaging', () => {
  it('any change other than the page goes back to page 1, and keeps the rest', () => {
    const next = withPaging(params('status=open&page=3&sort=title'), { status: 'closed' })
    expect(Object.fromEntries(next)).toEqual({ status: 'closed', sort: 'title' })
  })

  it('changing the page keeps everything else; page 1 is left out of the URL', () => {
    expect(Object.fromEntries(withPaging(params('status=open&page=3'), { page: 4 }))).toEqual({
      status: 'open',
      page: '4',
    })
    expect(Object.fromEntries(withPaging(params('status=open&page=3'), { page: 1 }))).toEqual({ status: 'open' })
  })

  it('an empty value removes the key', () => {
    expect(Object.fromEntries(withPaging(params('sort=title&order=asc'), { sort: '', order: '' }))).toEqual({})
  })
})

describe('labels and counts', () => {
  it('rangeLabel: "Showing 26–50 of 132", and the short last page', () => {
    expect(rangeLabel({ page: 2, pageSize: 25, total: 132, count: 25 })).toBe('Showing 26–50 of 132')
    expect(rangeLabel({ page: 6, pageSize: 25, total: 132, count: 7 })).toBe('Showing 126–132 of 132')
    expect(rangeLabel({ page: 1, pageSize: 25, total: 0, count: 0 })).toBe('Showing 0 of 0')
  })

  it('pageCount: at least 1', () => {
    expect(pageCount(132, 25)).toBe(6)
    expect(pageCount(0, 25)).toBe(1)
  })
})

describe('fallbackPage', () => {
  it('an empty page past the end goes to the new last page', () => {
    expect(fallbackPage({ items: [], total: 30, pageSize: 25 }, 5)).toBe(2)
    expect(fallbackPage({ items: [], total: 0, pageSize: 25 }, 3)).toBe(1)
  })

  it('a page with items, or page 1, stays', () => {
    expect(fallbackPage({ items: [{}], total: 30, pageSize: 25 }, 2)).toBeNull()
    expect(fallbackPage({ items: [], total: 0, pageSize: 25 }, 1)).toBeNull()
  })
})

describe('pagedResult', () => {
  it('takes the paged answer as it is', () => {
    expect(pagedResult({ items: [1], total: 9, page: 2, pageSize: 25 }, { page: 2, pageSize: 25 })).toEqual({
      items: [1],
      total: 9,
      page: 2,
      pageSize: 25,
    })
  })

  it('a plain array (a backend without paging) is one page with everything', () => {
    expect(pagedResult([1, 2, 3], { page: 1, pageSize: 25 })).toEqual({
      items: [1, 2, 3],
      total: 3,
      page: 1,
      pageSize: 25,
    })
  })
})

describe('badRequestDetails', () => {
  it("a 400: the message and each field's problem", () => {
    const err = {
      response: {
        status: 400,
        data: { message: 'Invalid query', errors: [{ field: 'sort', message: 'Sort must be one of …' }] },
      },
    }
    expect(badRequestDetails(err)).toEqual({ message: 'Invalid query', details: ['sort: Sort must be one of …'] })
  })

  it('anything else: null', () => {
    expect(badRequestDetails({ response: { status: 500, data: {} } })).toBeNull()
    expect(badRequestDetails(new Error('network'))).toBeNull()
  })
})
