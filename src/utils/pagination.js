// pagination.js – paging and sorting kept in the URL, next to a page's filters, for lists the backend pages
// (GET /tickets, GET /users with ?page=&pageSize=&sort=&order=, answering { items, total, page, pageSize }).
// Values in the URL are checked here first: anything that isn't valid falls back to the default instead of being sent.

export const PAGE_SIZES = [25, 50, 100]
export const DEFAULT_PAGE_SIZE = 25
export const PAGING_KEYS = ['page', 'pageSize', 'sort', 'order']

const positiveInt = (value) => (/^[1-9]\d*$/.test(value ?? '') ? Number(value) : null)

// { page, pageSize, sort, order } from the URL. sorts: the sort fields this list allows. sort/order are '' when the
// URL has none (the backend's own order applies).
export function readPaging(params, sorts) {
  const pageSize = positiveInt(params.get('pageSize'))
  const sort = params.get('sort') || ''
  const order = params.get('order') || ''
  const validSort = sorts.includes(sort) ? sort : ''
  return {
    page: positiveInt(params.get('page')) ?? 1,
    pageSize: PAGE_SIZES.includes(pageSize) ? pageSize : DEFAULT_PAGE_SIZE,
    sort: validSort,
    order: validSort && ['asc', 'desc'].includes(order) ? order : '',
  }
}

// The paging part of the API query: page and pageSize always (so the backend answers with the paged shape), sort and
// order only when chosen
export function pagingQuery({ page, pageSize, sort, order }) {
  const query = { page: String(page), pageSize: String(pageSize) }
  if (sort) {
    query.sort = sort
    if (order) query.order = order
  }
  return query
}

// A copy of the URL params with `changes` applied (a falsy value removes the key). Any change other than the page
// itself goes back to page 1, because the old page number means something else now.
export function withPaging(current, changes) {
  const next = new URLSearchParams(current)
  for (const [key, value] of Object.entries(changes)) {
    if (value) next.set(key, String(value))
    else next.delete(key)
  }
  if (!Object.hasOwn(changes, 'page')) next.delete('page')
  if (next.get('page') === '1') next.delete('page')
  return next
}

export const pageCount = (total, pageSize) => Math.max(1, Math.ceil(total / pageSize))

// "Showing 26–50 of 132"; "Showing 0 of 0" for an empty list
export function rangeLabel({ page, pageSize, total, count }) {
  if (total === 0 || count === 0) return `Showing 0 of ${total}`
  const first = (page - 1) * pageSize + 1
  return `Showing ${first}–${first + count - 1} of ${total}`
}

// The backend's answer, as { items, total, page, pageSize }. A backend without paging sends a plain array; it's taken
// as one page holding everything, so the list still works.
export function pagedResult(data, requested) {
  if (Array.isArray(data)) return { items: data, total: data.length, page: 1, pageSize: requested.pageSize }
  return {
    items: data.items ?? [],
    total: data.total ?? 0,
    page: data.page ?? requested.page,
    pageSize: data.pageSize ?? requested.pageSize,
  }
}

// The page to go to when the requested one came back empty although there are items (e.g. the last page after the
// filter or a deletion made the list shorter): the new last page. null when the page is fine.
export function fallbackPage(result, requestedPage) {
  if (result.items.length > 0 || requestedPage <= 1) return null
  return Math.min(requestedPage - 1, pageCount(result.total, result.pageSize))
}

// A 400 from the backend for bad paging/sorting values: its message plus each field's message
export function badRequestDetails(err) {
  const data = err?.response?.status === 400 ? err.response.data : null
  if (!data) return null
  const details = (data.errors ?? []).map((e) => (e.field ? `${e.field}: ${e.message}` : e.message))
  return { message: data.message || 'The request was not valid', details }
}
