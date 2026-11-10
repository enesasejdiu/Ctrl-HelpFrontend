// AuditLog.jsx – the audit log at /admin/audit (admins only): security events such as logins, lockouts, password
// resets and account changes, newest first, a page at a time.
// Uses GET /audit (filters user, action, from, to, page, pageSize → { entries, total, page, pageSize }) and
// GET /audit/actions (the action names), as described under "Audit log" in the backend README.
// The filters and the page live in the URL, so a filtered view can be bookmarked, shared, or reloaded.
import { ChevronLeft, ChevronRight, FilterX, ScrollText } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import client, { errorMessage } from '../api/client'
import { Alert, EmptyState, PageHeader, Spinner } from '../components/Ui'
import { actionLabel, auditSummary, isWarningAction } from '../utils/audit'
import { formatDate, timeAgo } from '../utils/format'

export const PAGE_SIZE = 25
const FILTER_KEYS = ['user', 'action', 'from', 'to']

export default function AuditLog() {
  const [params, setParams] = useSearchParams()
  const filters = Object.fromEntries(FILTER_KEYS.map((key) => [key, params.get(key) || '']))
  const page = Math.max(1, Number.parseInt(params.get('page'), 10) || 1)
  const hasFilters = FILTER_KEYS.some((key) => filters[key])
  // An empty page past the end counts as narrowed too ("Clear filters" also goes back to page 1)
  const narrowed = hasFilters || page > 1

  // The request for exactly what the URL shows; the page number is sent only when it isn't the first
  const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value))
  if (page > 1) query.set('page', String(page))
  query.set('pageSize', String(PAGE_SIZE))
  const queryString = query.toString()

  // The last finished request: which query it answered, and its data or error. The old page stays visible (faded)
  // while the next one loads.
  const [result, setResult] = useState({ query: null, data: null, error: '' })
  const [actions, setActions] = useState([])
  const [users, setUsers] = useState([])
  const loading = result.query !== queryString
  const data = result.data

  // A filter change starts again on page 1; replace, so filtering doesn't add steps to the Back button
  function setFilter(key, value) {
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        if (value) next.set(key, value)
        else next.delete(key)
        next.delete('page')
        return next
      },
      { replace: true },
    )
  }

  function goToPage(number) {
    setParams((current) => {
      const next = new URLSearchParams(current)
      if (number > 1) next.set('page', String(number))
      else next.delete('page')
      return next
    })
  }

  function clearFilters() {
    setParams({}, { replace: true })
  }

  // The dropdowns: action names and users. If either fails, the log itself still works.
  useEffect(() => {
    client
      .get('/audit/actions')
      .then(({ data: names }) => setActions(names))
      .catch(() => {})
    client
      .get('/users')
      .then(({ data: list }) => setUsers([...list].sort((a, b) => a.name.localeCompare(b.name))))
      .catch(() => {})
  }, [])

  // The log, whenever the filters or the page change; aborting drops answers to outdated requests
  useEffect(() => {
    const controller = new AbortController()
    client
      .get(`/audit?${queryString}`, { signal: controller.signal })
      .then(({ data: body }) => setResult({ query: queryString, data: body, error: '' }))
      .catch((err) => {
        if (!controller.signal.aborted) {
          setResult((current) => ({ ...current, query: queryString, error: errorMessage(err) }))
        }
      })
    return () => controller.abort()
  }, [queryString])

  const total = data?.total ?? 0
  const pageSize = data?.pageSize || PAGE_SIZE
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const error = loading ? '' : result.error

  return (
    <>
      <PageHeader
        title="Audit log"
        subtitle="Sign-ins, lockouts, password changes and account changes, newest first."
      />

      <section className="card">
        <div className="toolbar" role="search">
          <select
            className="select"
            value={filters.user}
            onChange={(e) => setFilter('user', e.target.value)}
            aria-label="User"
          >
            <option value="">All users</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>

          <select
            className="select"
            value={filters.action}
            onChange={(e) => setFilter('action', e.target.value)}
            aria-label="Action"
          >
            <option value="">All actions</option>
            {actions.map((action) => (
              <option key={action} value={action}>
                {actionLabel(action)}
              </option>
            ))}
          </select>

          <label className="date-filter">
            <span>From</span>
            <input
              type="date"
              className="input"
              value={filters.from}
              max={filters.to || undefined}
              onChange={(e) => setFilter('from', e.target.value)}
            />
          </label>
          <label className="date-filter">
            <span>To</span>
            <input
              type="date"
              className="input"
              value={filters.to}
              min={filters.from || undefined}
              onChange={(e) => setFilter('to', e.target.value)}
            />
          </label>
        </div>

        <div className="results-bar">
          <span aria-live="polite">
            {data === null
              ? result.error
                ? 'Events could not be loaded'
                : 'Loading events…'
              : `${total} ${total === 1 ? 'event' : 'events'}`}
          </span>
          {hasFilters && data?.entries.length !== 0 && (
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

        {data === null && !error ? (
          <Spinner label="Loading events…" />
        ) : data?.entries.length === 0 ? (
          <EmptyState
            icon={ScrollText}
            title={narrowed ? 'No events match these filters' : 'No events recorded yet'}
            action={
              narrowed && (
                <button type="button" className="btn btn--secondary" onClick={clearFilters}>
                  Clear filters
                </button>
              )
            }
          >
            {narrowed ? 'Try another user, action or date range.' : 'Sign-ins and account changes will show up here.'}
          </EmptyState>
        ) : (
          data && (
            <>
              <div className={`table-wrap${loading ? ' is-refreshing' : ''}`}>
                <table className="table table--stack">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Action</th>
                      <th>By</th>
                      <th>Account</th>
                      <th>Details</th>
                      <th>IP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.entries.map((entry) => (
                      <tr key={entry.id} className={isWarningAction(entry.action) ? 'is-warning' : undefined}>
                        <td className="text-muted table__date" data-label="Time" title={formatDate(entry.created_at)}>
                          <time dateTime={entry.created_at}>{timeAgo(entry.created_at)}</time>
                        </td>
                        <td data-label="Action">
                          <span
                            className={`audit-action${isWarningAction(entry.action) ? ' audit-action--warning' : ''}`}
                          >
                            {actionLabel(entry.action)}
                          </span>
                        </td>
                        <td data-label="By">{entry.actor?.name || '—'}</td>
                        <td data-label="Account">{entry.target?.name || '—'}</td>
                        <td className="text-muted" data-label="Details">
                          {auditSummary(entry) || '—'}
                        </td>
                        <td className="text-muted table__ip" data-label="IP">
                          {entry.ip || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <nav className="pagination" aria-label="Pages">
                <button
                  type="button"
                  className="btn btn--secondary btn--sm"
                  onClick={() => goToPage(page - 1)}
                  disabled={page <= 1}
                >
                  <ChevronLeft size={16} aria-hidden="true" />
                  Previous
                </button>
                <span className="pagination__status">
                  Page {Math.min(page, totalPages)} of {totalPages}
                </span>
                <button
                  type="button"
                  className="btn btn--secondary btn--sm"
                  onClick={() => goToPage(page + 1)}
                  disabled={page >= totalPages}
                >
                  Next
                  <ChevronRight size={16} aria-hidden="true" />
                </button>
              </nav>
            </>
          )
        )}
      </section>
    </>
  )
}
