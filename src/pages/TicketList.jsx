// TicketList.jsx – the ticket list at /tickets.
// Employees see "My tickets" (the API only returns their own); staff see "All tickets" with extra filters.
// Filters live in the URL (?q=&status=&priority=&category=&assigned=&overdue=1) so reloads and shared links keep them.
import { FilterX, Inbox, Plus, Search, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import client, { errorMessage } from '../api/client'
import { OverdueBadge, PriorityBadge, StatusBadge } from '../components/Badges'
import { Alert, Avatar, EmptyState, PageHeader } from '../components/Ui'
import { useAuth } from '../context/auth'
import { STATUSES, formatDate, statusLabel, timeAgo } from '../utils/format'

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

  // The last finished request: which query it was for, and its tickets or error.
  // tickets stays null until the first load finishes; the old list stays visible while a new filter loads.
  const [result, setResult] = useState({ query: null, tickets: null, error: '' })
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
  const queryString = new URLSearchParams(Object.entries(filters).filter(([, value]) => value)).toString()
  const hasFilters = queryString !== ''

  const { tickets } = result
  // Still loading while the last finished request was for different filters than the ones in the URL
  const loading = result.query !== queryString
  const error = metaError || (loading ? '' : result.error)

  // replace: changing a filter shouldn't add a step to the Back button
  function setFilter(key, value) {
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        if (value) next.set(key, value)
        else next.delete(key)
        return next
      },
      { replace: true },
    )
  }

  // Debounced search: the URL is only updated once typing pauses for SEARCH_DELAY_MS
  function changeSearch(value, delay = SEARCH_DELAY_MS) {
    setSearch(value)
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => setFilter('q', value.trim()), delay)
  }

  function clearFilters() {
    clearTimeout(searchTimer.current)
    setSearch('')
    setParams({}, { replace: true })
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

  // Load tickets whenever the filters change; aborting drops responses from outdated requests
  useEffect(() => {
    const controller = new AbortController()
    client
      .get(`/tickets${queryString ? `?${queryString}` : ''}`, { signal: controller.signal })
      .then(({ data }) => setResult({ query: queryString, tickets: data, error: '' }))
      .catch((err) => {
        if (!controller.signal.aborted) {
          setResult((current) => ({ ...current, query: queryString, error: errorMessage(err) }))
        }
      })
    return () => controller.abort()
  }, [queryString])

  // Counted from the loaded tickets, so it follows the active filters
  const overdueCount = tickets?.filter((t) => t.is_overdue).length || 0

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
              : `${tickets.length} ${tickets.length === 1 ? 'ticket' : 'tickets'}`}
            {overdueCount > 0 && <span className="results-bar__overdue"> · {overdueCount} overdue</span>}
          </span>
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
            <Alert>{error}</Alert>
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
                    <th>Title</th>
                    <th>Status</th>
                    <th>Priority</th>
                    <th>Category</th>
                    {isStaff && <th>Requester</th>}
                    <th>Assigned to</th>
                    <th>Created</th>
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
