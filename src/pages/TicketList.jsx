// TicketList.jsx – the ticket list at /tickets.
// Employees see "My tickets" (the API only returns their own); staff see "All tickets" with extra filters.
// Filters, paging and sorting live in the URL (?q=&status=&priority=&category=&assigned=&overdue=1&page=&pageSize=&sort=
// &order=) so reloads and shared links keep them. The API pages the list (utils/pagination.js); changing a filter, the
// sort or the page size goes back to page 1, and an empty page past the end goes back to the last page.
import { FilterX, Inbox, Plus, Search, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import client, { errorMessage } from '../api/client'
import { OverdueBadge, PriorityBadge, StatusBadge } from '../components/Badges'
import Pagination from '../components/Pagination'
import SortHeader from '../components/SortHeader'
import SortSelect from '../components/SortSelect'
import { Alert, Avatar, EmptyState, PageHeader } from '../components/Ui'
import { useAuth } from '../context/auth'
import { STATUSES, formatDate, statusLabel, timeAgo } from '../utils/format'
import {
  PAGING_KEYS,
  badRequestDetails,
  fallbackPage,
  pagedResult,
  pagingQuery,
  rangeLabel,
  readPaging,
  withPaging,
} from '../utils/pagination'

// What the list can be sorted by (the backend accepts the same), and the order a column starts with
const TICKET_SORTS = ['created_at', 'updated_at', 'priority', 'status', 'title']
const FIRST_ORDER = { created_at: 'desc', updated_at: 'desc', priority: 'desc', status: 'asc', title: 'asc' }
const SORT_FIELDS = [
  { field: 'created_at', label: 'Created' },
  { field: 'updated_at', label: 'Last updated' },
  { field: 'priority', label: 'Priority' },
  { field: 'status', label: 'Status' },
  { field: 'title', label: 'Title' },
]

const SEARCH_DELAY_MS = 300
const ASSIGNED_OPTIONS = [
  { value: '', label: 'Anyone' },
  { value: 'me', label: 'Me' },
  { value: 'unassigned', label: 'Unassigned' },
]

export default function TicketList() {
  const { isStaff } = useAuth()
  const navigate = useNavigate()
  // The URL's query string is the single source of truth for the filters
  const [params, setParams] = useSearchParams()

  // The last finished request: which query it was for, and its page of tickets or error.
  // page stays null until the first load finishes; the old page stays visible while a new one loads.
  const [result, setResult] = useState({ query: null, page: null, error: '', badRequest: null })
  const [meta, setMeta] = useState({ categories: [], priorities: [] })
  const [metaError, setMetaError] = useState('')
  // The search box updates instantly; the URL (and so the request) follows after a short pause
  const [search, setSearch] = useState(params.get('q') || '')
  const searchTimer = useRef(null)

  // Only send the filters this role is allowed to use
  const filterKeys = isStaff
    ? ['q', 'status', 'priority', 'category', 'assigned', 'overdue']
    : ['q', 'status', 'priority', 'category']
  const filters = Object.fromEntries(filterKeys.map((key) => [key, params.get(key) || '']))
  const filterQuery = new URLSearchParams(Object.entries(filters).filter(([, value]) => value)).toString()
  const hasFilters = filterQuery !== ''
  const paging = readPaging(params, TICKET_SORTS)
  // Filters plus paging: always page and pageSize, so the backend answers with { items, total, page, pageSize }
  const queryString = new URLSearchParams({
    ...Object.fromEntries(new URLSearchParams(filterQuery)),
    ...pagingQuery(paging),
  }).toString()

  const tickets = result.page?.items ?? null
  // Still loading while the last finished request was for different filters than the ones in the URL
  const loading = result.query !== queryString
  const error = metaError || (loading ? '' : result.error)

  // replace: changing a filter shouldn't add a step to the Back button. Back to page 1 (withPaging).
  function setFilter(key, value) {
    setParams((current) => withPaging(current, { [key]: value }), { replace: true })
  }

  // Paging adds history steps, so Back returns to the previous page of the list
  const setPage = (page) => setParams((current) => withPaging(current, { page }))
  const setPageSize = (pageSize) => setParams((current) => withPaging(current, { pageSize }), { replace: true })
  const setSort = (sort, order) => setParams((current) => withPaging(current, { sort, order }), { replace: true })
  const resetPaging = () =>
    setParams((current) => withPaging(current, Object.fromEntries(PAGING_KEYS.map((key) => [key, '']))), {
      replace: true,
    })

  // Debounced search: the URL is only updated once typing pauses for SEARCH_DELAY_MS
  function changeSearch(value, delay = SEARCH_DELAY_MS) {
    setSearch(value)
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => setFilter('q', value.trim()), delay)
  }

  // Removes the filters; the page size and the sort stay
  function clearFilters() {
    clearTimeout(searchTimer.current)
    setSearch('')
    setParams(
      (current) => {
        const next = new URLSearchParams()
        for (const key of ['pageSize', 'sort', 'order']) if (current.get(key)) next.set(key, current.get(key))
        return next
      },
      { replace: true },
    )
  }

  // Don't fire a pending search after leaving the page
  useEffect(() => () => clearTimeout(searchTimer.current), [])

  // Categories and priorities for the dropdowns
  useEffect(() => {
    client
      .get('/meta')
      .then(({ data }) => setMeta(data))
      .catch((err) => setMetaError(errorMessage(err)))
  }, [])

  // Load tickets whenever the filters or paging change; aborting drops responses from outdated requests
  const requestedPage = paging.page
  const requestedPageSize = paging.pageSize
  // setParams changes identity when the URL changes; read it from a ref so the load doesn't run twice
  const setParamsRef = useRef(setParams)
  useEffect(() => {
    setParamsRef.current = setParams
  })
  useEffect(() => {
    const controller = new AbortController()
    client
      .get(`/tickets?${queryString}`, { signal: controller.signal })
      .then(({ data }) => {
        const page = pagedResult(data, { page: requestedPage, pageSize: requestedPageSize })
        // An empty page past the end (the list got shorter): show the new last page instead
        const fallback = fallbackPage(page, requestedPage)
        if (fallback !== null) {
          setParamsRef.current((current) => withPaging(current, { page: fallback }), { replace: true })
          return
        }
        setResult({ query: queryString, page, error: '', badRequest: null })
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          setResult((current) => ({
            ...current,
            query: queryString,
            error: errorMessage(err),
            badRequest: badRequestDetails(err),
          }))
        }
      })
    return () => controller.abort()
  }, [queryString, requestedPage, requestedPageSize])

  // Counted from the tickets on this page
  const overdueCount = tickets?.filter((t) => t.is_overdue).length || 0
  const total = result.page?.total ?? 0
  const pagingProps = { sort: paging.sort, order: paging.order, onSort: setSort }

  return (
    <>
      <PageHeader
        title={isStaff ? 'All tickets' : 'My tickets'}
        subtitle={
          isStaff
            ? 'Every ticket reported to IT, most urgent first.'
            : 'Problems you have reported to IT and where they stand.'
        }
        actions={
          <Link to="/tickets/new" className="btn btn--primary">
            <Plus size={16} strokeWidth={2.5} aria-hidden="true" />
            New ticket
          </Link>
        }
      />

      <section className="card">
        <div className="toolbar" role="search">
          <div className="search-input">
            <Search size={16} className="search-input__icon" aria-hidden="true" />
            <input
              type="search"
              className="input"
              placeholder="Search title or description…"
              value={search}
              onChange={(e) => changeSearch(e.target.value)}
              aria-label="Search tickets"
            />
            {search && (
              <button
                type="button"
                className="search-input__clear"
                onClick={() => changeSearch('', 0)}
                aria-label="Clear search"
              >
                <X size={14} aria-hidden="true" />
              </button>
            )}
          </div>

          <select
            className="select"
            value={filters.status}
            onChange={(e) => setFilter('status', e.target.value)}
            aria-label="Status"
          >
            <option value="">All statuses</option>
            {STATUSES.map((status) => (
              <option key={status} value={status}>
                {statusLabel(status)}
              </option>
            ))}
          </select>

          <select
            className="select"
            value={filters.priority}
            onChange={(e) => setFilter('priority', e.target.value)}
            aria-label="Priority"
          >
            <option value="">All priorities</option>
            {meta.priorities.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          <select
            className="select"
            value={filters.category}
            onChange={(e) => setFilter('category', e.target.value)}
            aria-label="Category"
          >
            <option value="">All categories</option>
            {meta.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {isStaff && (
          <div className="toolbar toolbar--secondary">
            <div className="segmented" role="group" aria-label="Assigned to">
              <span className="segmented__label">Assigned to</span>
              {ASSIGNED_OPTIONS.map((option) => (
                <button
                  key={option.value || 'any'}
                  type="button"
                  className="segmented__option"
                  aria-pressed={filters.assigned === option.value}
                  onClick={() => setFilter('assigned', option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <label className="switch">
              <input
                type="checkbox"
                checked={filters.overdue === '1'}
                onChange={(e) => setFilter('overdue', e.target.checked ? '1' : '')}
              />
              <span className="switch__track" aria-hidden="true" />
              Overdue only
            </label>
          </div>
        )}

        <div className="results-bar">
          {/* Live region: screen readers announce the new count after a filter changes the list */}
          <span aria-live="polite">
            {tickets === null
              ? result.error
                ? 'Tickets could not be loaded'
                : 'Loading tickets…'
              : rangeLabel({ page: result.page.page, pageSize: result.page.pageSize, total, count: tickets.length })}
            {overdueCount > 0 && (
              <span className="results-bar__overdue">
                {' '}
                · {overdueCount} overdue{total > tickets.length ? ' on this page' : ''}
              </span>
            )}
          </span>
          <SortSelect fields={SORT_FIELDS} firstOrder={FIRST_ORDER} {...pagingProps} />
          {/* With no results the empty state shows its own "Clear filters" button; don't show two */}
          {hasFilters && tickets?.length !== 0 && (
            <button type="button" className="link-button" onClick={clearFilters}>
              <FilterX size={14} aria-hidden="true" />
              Clear filters
            </button>
          )}
        </div>

        {error && (
          <div className="card__section">
            <Alert>
              {result.badRequest && !metaError ? (
                <>
                  <p>{result.badRequest.message}</p>
                  {result.badRequest.details.length > 0 && (
                    <ul className="alert__list">
                      {result.badRequest.details.map((detail) => (
                        <li key={detail}>{detail}</li>
                      ))}
                    </ul>
                  )}
                  <button type="button" className="link-button" onClick={resetPaging}>
                    Reset sorting and pages
                  </button>
                </>
              ) : (
                error
              )}
            </Alert>
          </div>
        )}

        {tickets === null && !error ? (
          <TableSkeleton columns={isStaff ? 8 : 7} />
        ) : tickets?.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title="No tickets found."
            action={
              hasFilters ? (
                <button type="button" className="btn btn--secondary" onClick={clearFilters}>
                  Clear filters
                </button>
              ) : (
                <Link to="/tickets/new" className="btn btn--primary">
                  <Plus size={16} aria-hidden="true" />
                  Report a problem
                </Link>
              )
            }
          >
            {hasFilters
              ? 'Try a different search or remove some filters.'
              : 'When you report a problem, it shows up here.'}
          </EmptyState>
        ) : (
          tickets && (
            <div className={`table-wrap${loading ? ' is-refreshing' : ''}`}>
              <table className="table table--stack">
                <thead>
                  <tr>
                    <th className="table__id">#</th>
                    <SortHeader field="title" label="Title" firstOrder={FIRST_ORDER.title} {...pagingProps} />
                    <SortHeader field="status" label="Status" firstOrder={FIRST_ORDER.status} {...pagingProps} />
                    <SortHeader field="priority" label="Priority" firstOrder={FIRST_ORDER.priority} {...pagingProps} />
                    <th>Category</th>
                    {isStaff && <th>Requester</th>}
                    <th>Assigned to</th>
                    <SortHeader
                      field="created_at"
                      label="Created"
                      firstOrder={FIRST_ORDER.created_at}
                      {...pagingProps}
                    />
                  </tr>
                </thead>
                <tbody>
                  {tickets.map((ticket) => (
                    <tr
                      key={ticket.id}
                      className={ticket.is_overdue ? 'is-overdue' : undefined}
                      // The whole row opens the ticket; the title link stays the keyboard/screen-reader target
                      onClick={(e) => {
                        if (!e.target.closest('a')) navigate(`/tickets/${ticket.id}`)
                      }}
                    >
                      <td className="table__id">{ticket.id}</td>
                      <td className="table__title">
                        <Link to={`/tickets/${ticket.id}`}>{ticket.title}</Link>
                        {ticket.is_overdue && <OverdueBadge />}
                      </td>
                      <td data-label="Status">
                        <StatusBadge status={ticket.status} />
                      </td>
                      <td data-label="Priority">
                        <PriorityBadge priority={ticket.priority_name} />
                      </td>
                      <td className="text-muted" data-label="Category">
                        {ticket.category_name}
                      </td>
                      {isStaff && (
                        <td data-label="Requester">
                          <span className="person">
                            <Avatar name={ticket.requester_name} size="sm" />
                            {ticket.requester_name}
                          </span>
                        </td>
                      )}
                      <td data-label="Assigned to">
                        {ticket.assignee_name ? (
                          <span className="person">
                            <Avatar name={ticket.assignee_name} size="sm" />
                            {ticket.assignee_name}
                          </span>
                        ) : (
                          <span className="text-faint">Unassigned</span>
                        )}
                      </td>
                      <td className="text-muted table__date" data-label="Created" title={formatDate(ticket.created_at)}>
                        {timeAgo(ticket.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}

        {tickets && total > 0 && (
          <Pagination
            label="Ticket pages"
            page={result.page.page}
            pageSize={result.page.pageSize}
            total={total}
            onPage={setPage}
            onPageSize={setPageSize}
          />
        )}
      </section>
    </>
  )
}

// Grey placeholder rows shown while the first page of tickets loads
function TableSkeleton({ columns }) {
  return (
    <div className="table-wrap" aria-hidden="true">
      <table className="table">
        <tbody>
          {Array.from({ length: 6 }, (_, row) => (
            <tr key={row}>
              {Array.from({ length: columns }, (_, col) => (
                <td key={col}>
                  <span className="skeleton" style={{ width: col === 1 ? '80%' : '60%' }} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
