// TicketDetail.jsx – one ticket at /tickets/:id: description, attachments, comments, info and history.
// Staff get a "Manage" box; employees get close / reopen buttons once IT has resolved their ticket.
// The API has the final say on who may do what. After every action the page reloads the ticket,
// because one change can trigger others (assigning also moves the status and adds history rows).
import { ArrowLeft, Check, Lock, LoaderCircle, RotateCcw, Save, Send, UserPlus } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import client, { errorMessage, isNotFound } from '../api/client'
import { OverdueBadge, PriorityBadge, StatusBadge } from '../components/Badges'
import NotFound from '../components/NotFound'
import TicketAttachments from '../components/TicketAttachments'
import { Alert, Avatar, PageHeader, Spinner } from '../components/Ui'
import { useAuth } from '../context/auth'
import { t } from '../i18n'
import { ROLE_LABELS, STATUSES, formatDate, statusLabel, targetLabel, timeAgo } from '../utils/format'

const DONE_STATUSES = ['resolved', 'closed']
const HISTORY_FIELDS = { status: 'status', priority: 'priority', assigned_to: 'assignee' }

// Runs a request for one form, tracks its busy/error state, then reloads the ticket.
// It also reloads after a failure: the usual cause is that someone else changed the ticket first.
// run() resolves to true when the request succeeded.
function useAction(reload) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function run(request) {
    setBusy(true)
    setError('')
    let succeeded = false
    try {
      await request()
      succeeded = true
    } catch (err) {
      setError(errorMessage(err))
    }
    await reload()
    setBusy(false)
    return succeeded
  }

  return { busy, error, setError, run }
}

// The key gives each ticket a fresh page, so drafts never carry over from another ticket
export default function TicketDetail() {
  const { id } = useParams()
  return <TicketPage key={id} id={id} />
}

// Ticket ids are positive whole numbers; anything else can't be a ticket, so it isn't even requested
const TICKET_ID = /^[1-9]\d*$/

function TicketPage({ id }) {
  const { isStaff } = useAuth()
  const [ticket, setTicket] = useState(null)
  const [error, setError] = useState('')
  // The ticket doesn't exist (or was deleted, also while the page was open): "not found" instead of an error box
  const [missing, setMissing] = useState(!TICKET_ID.test(id))
  const latestLoad = useRef(0)

  // Only the newest load may update the page, in case two actions finish out of order
  const load = useCallback(() => {
    const thisLoad = ++latestLoad.current
    return client
      .get(`/tickets/${id}`)
      .then(({ data }) => {
        if (thisLoad === latestLoad.current) {
          setTicket(data)
          setError('')
        }
      })
      .catch((err) => {
        if (thisLoad !== latestLoad.current) return
        if (isNotFound(err)) setMissing(true)
        else setError(errorMessage(err))
      })
  }, [id])

  useEffect(() => {
    if (TICKET_ID.test(id)) load()
  }, [id, load])

  if (missing) return <NotFound message={t('notFound.ticket')} />

  return (
    <>
      <Link to="/tickets" className="back-link">
        <ArrowLeft size={16} aria-hidden="true" />
        Back to tickets
      </Link>

      {!ticket && error && <Alert>{error}</Alert>}
      {!ticket && !error && (
        <div className="card">
          <Spinner label="Loading ticket…" />
        </div>
      )}

      {ticket && (
        <>
          <PageHeader
            title={
              <>
                <span className="ticket-id">#{ticket.id}</span> {ticket.title}
              </>
            }
            subtitle={
              <span className="ticket-badges">
                <StatusBadge status={ticket.status} />
                <PriorityBadge priority={ticket.priority_name} />
                {ticket.is_overdue && <OverdueBadge />}
              </span>
            }
          />

          <div className="split">
            <div className="stack">
              {error && <Alert>{error}</Alert>}

              <section className="card card--padded">
                <h2 className="panel-title">Description</h2>
                <p className="user-text">{ticket.description}</p>
              </section>

              <TicketAttachments ticket={ticket} reload={load} />

              {ticket.resolution && (
                <section className="card card--padded card--resolution">
                  {/* A reopened ticket keeps its old note, but that note no longer describes a fix */}
                  <h2 className="panel-title">
                    {DONE_STATUSES.includes(ticket.status) ? 'Resolution' : 'Previous resolution'}
                  </h2>
                  <p className="user-text">{ticket.resolution}</p>
                </section>
              )}

              <section className="card card--padded">
                <h2 className="panel-title">Comments ({ticket.comments.length})</h2>
                <CommentList comments={ticket.comments} />
                <CommentForm ticketId={ticket.id} reload={load} />
              </section>
            </div>

            <aside className="stack">
              {!isStaff && DONE_STATUSES.includes(ticket.status) && <EmployeeBox ticket={ticket} reload={load} />}
              {isStaff && <ManageBox ticket={ticket} reload={load} />}
              <InfoBox ticket={ticket} />
              <HistoryBox history={ticket.history} />
            </aside>
          </div>
        </>
      )}
    </>
  )
}

// Shows a spinner in place of the button's icon while its request runs
function ButtonIcon({ busy, icon: Icon }) {
  return busy ? <LoaderCircle size={16} className="spin" aria-hidden="true" /> : <Icon size={16} aria-hidden="true" />
}

function CommentList({ comments }) {
  if (comments.length === 0) {
    return <p className="comments__empty">No comments yet.</p>
  }

  return (
    <ul className="comments">
      {comments.map((comment) => (
        <li key={comment.id} className={`comment${comment.is_internal ? ' comment--internal' : ''}`}>
          <div className="comment__header">
            <Avatar name={comment.author_name} size="sm" />
            <span className="comment__author">{comment.author_name}</span>
            {comment.author_role !== 'employee' && (
              <span className={`role-tag role-tag--${comment.author_role}`}>{ROLE_LABELS[comment.author_role]}</span>
            )}
            {comment.is_internal && (
              <span className="internal-label">
                <Lock size={11} aria-hidden="true" />
                Internal note
              </span>
            )}
            <span className="comment__time" title={formatDate(comment.created_at)}>
              {timeAgo(comment.created_at)}
            </span>
          </div>
          <p className="user-text">{comment.content}</p>
        </li>
      ))}
    </ul>
  )
}

function CommentForm({ ticketId, reload }) {
  const { isStaff } = useAuth()
  const { busy, error, setError, run } = useAction(reload)
  const [content, setContent] = useState('')
  const [isInternal, setIsInternal] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    if (!content.trim()) {
      setError('Comment cannot be empty')
      return
    }
    const saved = await run(() =>
      // Employees never see the switch, and the backend ignores is_internal from them anyway
      client.post(`/tickets/${ticketId}/comments`, { content: content.trim(), is_internal: isInternal }),
    )
    // The draft is kept after a failure, so nothing typed gets lost
    if (saved) {
      setContent('')
      setIsInternal(false)
    }
  }

  return (
    <form className="comment-form" onSubmit={handleSubmit} noValidate>
      {error && <Alert>{error}</Alert>}
      <textarea
        className="textarea"
        rows={3}
        placeholder={isInternal ? 'Only IT staff can see this note…' : 'Write a comment…'}
        aria-label="Comment"
        value={content}
        onChange={(e) => setContent(e.target.value)}
      />
      <div className="comment-form__actions">
        {isStaff && (
          <label className="switch">
            <input type="checkbox" checked={isInternal} onChange={(e) => setIsInternal(e.target.checked)} />
            <span className="switch__track" aria-hidden="true" />
            Internal note
          </label>
        )}
        <button type="submit" className="btn btn--primary" disabled={busy}>
          <ButtonIcon busy={busy} icon={Send} />
          {isInternal ? 'Add internal note' : 'Add comment'}
        </button>
      </div>
    </form>
  )
}

// Employees can confirm a resolved ticket (close) or reject it (reopen); a closed one can only be reopened
function EmployeeBox({ ticket, reload }) {
  const { busy, error, run } = useAction(reload)
  // This box is only shown for resolved or closed tickets (see TicketPage)
  const isResolved = ticket.status === 'resolved'

  function setStatus(status) {
    run(() => client.patch(`/tickets/${ticket.id}/status`, { status }))
  }

  return (
    <section className="card card--padded">
      <h2 className="panel-title">Is your problem fixed?</h2>
      {error && <Alert>{error}</Alert>}
      <p className="text-muted">
        {isResolved
          ? 'IT marked this ticket as resolved. Close it if everything works, or reopen it if not.'
          : 'This ticket is closed. Reopen it if the problem came back.'}
      </p>
      <div className="button-row">
        {isResolved && (
          <button type="button" className="btn btn--primary" disabled={busy} onClick={() => setStatus('closed')}>
            <ButtonIcon busy={busy} icon={Check} />
            Close
          </button>
        )}
        <button type="button" className="btn btn--secondary" disabled={busy} onClick={() => setStatus('reopened')}>
          <ButtonIcon busy={busy} icon={RotateCcw} />
          Reopen
        </button>
      </div>
    </section>
  )
}

function ManageBox({ ticket, reload }) {
  // Admins assign to anyone; agents can only assign to themselves, so they get a button instead of a dropdown
  const { user, isAdmin } = useAuth()
  const { busy, error, run } = useAction(reload)
  const [options, setOptions] = useState({ priorities: [], agents: [] })
  const [optionsError, setOptionsError] = useState('')

  // Dropdown data; the agent list is only needed by admins, who are the only ones assigning to others
  useEffect(() => {
    Promise.all([client.get('/meta'), isAdmin ? client.get('/users/agents') : null])
      .then(([meta, agents]) => setOptions({ priorities: meta.data.priorities, agents: agents?.data || [] }))
      .catch((err) => setOptionsError(errorMessage(err)))
  }, [isAdmin])

  // Always offer the current values, so a dropdown can't show the wrong one:
  // priorities may still be loading, and a deactivated assignee is missing from the agent list
  const priorities = options.priorities.length
    ? options.priorities
    : [{ id: ticket.priority_id, name: ticket.priority_name }]
  const agents =
    ticket.assigned_to && !options.agents.some((agent) => agent.id === ticket.assigned_to)
      ? [...options.agents, { id: ticket.assigned_to, name: ticket.assignee_name }]
      : options.agents

  // Priority and assignee save as soon as they are picked; only status has a button, because it may need a note
  function changePriority(event) {
    const priorityId = Number(event.target.value)
    run(() => client.patch(`/tickets/${ticket.id}/priority`, { priority_id: priorityId }))
  }

  function assignTo(userId) {
    run(() => client.patch(`/tickets/${ticket.id}/assign`, { assigned_to: userId }))
  }

  return (
    <section className="card card--padded form">
      <h2 className="panel-title">Manage</h2>
      {optionsError && <Alert>{optionsError}</Alert>}

      {/* The key resets the form's draft whenever the ticket's status changes */}
      <StatusForm key={ticket.status} ticket={ticket} reload={reload} />

      {error && <Alert>{error}</Alert>}

      <div className="field">
        <label htmlFor="manage-priority">Priority</label>
        <select
          id="manage-priority"
          className="select"
          value={ticket.priority_id}
          onChange={changePriority}
          disabled={busy || options.priorities.length === 0}
        >
          {priorities.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {isAdmin ? (
        <div className="field">
          <label htmlFor="manage-assignee">Assign to</label>
          <select
            id="manage-assignee"
            className="select"
            value={ticket.assigned_to ?? ''}
            onChange={(e) => assignTo(e.target.value ? Number(e.target.value) : null)}
            disabled={busy}
          >
            <option value="">Unassigned</option>
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name}
              </option>
            ))}
          </select>
        </div>
      ) : ticket.assigned_to === user.id ? (
        <p className="text-muted">This ticket is assigned to you.</p>
      ) : (
        <button
          type="button"
          className="btn btn--secondary btn--block"
          disabled={busy}
          onClick={() => assignTo(user.id)}
        >
          <ButtonIcon busy={busy} icon={UserPlus} />
          Take this ticket
        </button>
      )}
    </section>
  )
}

function StatusForm({ ticket, reload }) {
  const { busy, error, setError, run } = useAction(reload)
  const [status, setStatus] = useState(ticket.status)
  // Starts with the old note when a reopened ticket is resolved again
  const [resolution, setResolution] = useState(ticket.resolution || '')

  // The note is only needed when this update actually moves the ticket to "resolved"
  const changed = status !== ticket.status
  const resolving = changed && status === 'resolved'

  function handleSubmit(event) {
    event.preventDefault()
    if (resolving && !resolution.trim()) {
      setError('Please write a resolution note')
      return
    }
    run(() =>
      client.patch(`/tickets/${ticket.id}/status`, resolving ? { status, resolution: resolution.trim() } : { status }),
    )
  }

  return (
    <form className="form" onSubmit={handleSubmit} noValidate>
      {error && <Alert>{error}</Alert>}

      <div className="field">
        <label htmlFor="manage-status">Status</label>
        <select id="manage-status" className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
          {STATUSES.map((value) => (
            <option key={value} value={value}>
              {statusLabel(value)}
            </option>
          ))}
        </select>
      </div>

      {resolving && (
        <div className="field">
          <label htmlFor="manage-resolution">Resolution note</label>
          <textarea
            id="manage-resolution"
            className="textarea"
            rows={4}
            placeholder="What fixed the problem?"
            value={resolution}
            onChange={(e) => setResolution(e.target.value)}
            required
          />
          <span className="field__hint">The requester can read this note.</span>
        </div>
      )}

      <button type="submit" className="btn btn--primary btn--block" disabled={busy || !changed}>
        <ButtonIcon busy={busy} icon={Save} />
        Update status
      </button>
    </form>
  )
}

function InfoBox({ ticket }) {
  return (
    <section className="card card--padded">
      <h2 className="panel-title">Details</h2>
      <dl className="info-list">
        <div>
          <dt>Requester</dt>
          <dd>{ticket.requester_name}</dd>
        </div>
        <div>
          <dt>Assigned to</dt>
          <dd>{ticket.assignee_name || <span className="text-faint">Unassigned</span>}</dd>
        </div>
        <div>
          <dt>Category</dt>
          <dd>{ticket.category_name}</dd>
        </div>
        <div>
          <dt>Created</dt>
          <dd>{formatDate(ticket.created_at)}</dd>
        </div>
        <div>
          <dt>Resolved</dt>
          {/* resolved_at stays set if staff move a ticket back to e.g. In Progress, so check the status too */}
          <dd>{DONE_STATUSES.includes(ticket.status) ? formatDate(ticket.resolved_at) : '—'}</dd>
        </div>
        <div>
          <dt>Target time</dt>
          <dd>{targetLabel(ticket.target_hours)}</dd>
        </div>
      </dl>
    </section>
  )
}

// History stores display text, except statuses (raw values) and "no assignee" (null)
function historyValue(field, value) {
  if (field === 'status') return statusLabel(value)
  return value ?? 'Unassigned'
}

function HistoryBox({ history }) {
  return (
    <section className="card card--padded">
      <h2 className="panel-title">History</h2>
      <ol className="history">
        {history.map((entry) => (
          <li key={entry.id}>
            <strong>{entry.changed_by_name}</strong>{' '}
            {/* The first row of every ticket is its creation: status from nothing to "open" */}
            {entry.field_changed === 'status' && entry.old_value === null ? (
              'created the ticket'
            ) : (
              <>
                changed {HISTORY_FIELDS[entry.field_changed] || entry.field_changed}:{' '}
                {historyValue(entry.field_changed, entry.old_value)} →{' '}
                {historyValue(entry.field_changed, entry.new_value)}
              </>
            )}
            <time dateTime={entry.changed_at}>{formatDate(entry.changed_at)}</time>
          </li>
        ))}
      </ol>
    </section>
  )
}
