// Users.jsx – user management at /admin/users (admins and HR).
// Lists the accounts a page at a time (GET /users?page=&pageSize=&sort=&order=, kept in the URL; see
// utils/pagination.js), sortable by name, email, role, department and join date. Admins can add, edit and reset anyone, change roles and activate/deactivate
// accounts. HR sees everyone but can only do this for employees, and never changes roles (the backend enforces both).
// On your own row you can edit your details, but not your role, active status or password (use Change password).
// "Add user" (POST /users) and "Reset password" (POST /users/:id/reset-password) deliver the password the way the
// backend says in password_delivery: 'email' → a one-time link was emailed (the page says so; no password is shown),
// 'temporary_password' → the temporary password is shown once. Which one is the server's choice (is email set up?).
// With email, rows that still wait for their password get "Resend link" (POST /users/:id/resend-link: a new link, the
// old one stops working). GET /meta says whether email is set up, so the button only shows when it can work.
import { KeyRound, Mail, Pencil, UserPlus, Users as UsersIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import client, { errorMessage } from '../api/client'
import Pagination from '../components/Pagination'
import ResetPasswordDialog from '../components/ResetPasswordDialog'
import SortHeader from '../components/SortHeader'
import SortSelect from '../components/SortSelect'
import TemporaryPasswordDialog from '../components/TemporaryPasswordDialog'
import UserDialog from '../components/UserDialog'
import { Alert, Avatar, EmptyState, PageHeader, Spinner } from '../components/Ui'
import { useAuth } from '../context/auth'
import { ROLE_LABELS, formatDate } from '../utils/format'
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

const ROLES = Object.keys(ROLE_LABELS)

// What the list can be sorted by (the backend accepts the same), and the order a column starts with
const USER_SORTS = ['name', 'email', 'role', 'department', 'created_at']
const FIRST_ORDER = { name: 'asc', email: 'asc', role: 'asc', department: 'asc', created_at: 'desc' }
const SORT_FIELDS = [
  { field: 'name', label: 'Name' },
  { field: 'email', label: 'Email' },
  { field: 'department', label: 'Department' },
  { field: 'role', label: 'Role' },
  { field: 'created_at', label: 'Joined' },
]

export default function Users() {
  const { user: me, updateUser: updateSession } = useAuth()
  const [params, setParams] = useSearchParams()
  const paging = readPaging(params, USER_SORTS)
  const queryString = new URLSearchParams(pagingQuery(paging)).toString()
  // The current page: { items, total, page, pageSize }; null until the first load finishes
  const [result, setResult] = useState(null)
  const users = result?.items ?? null
  const setUsers = (update) => setResult((current) => current && { ...current, items: update(current.items) })
  // Raised to load the current page again (after adding a user, who may belong on another page)
  const [reloadKey, setReloadKey] = useState(0)
  const [loadError, setLoadError] = useState('')
  const [badRequest, setBadRequest] = useState(null)
  const [actionError, setActionError] = useState('')
  const [savingId, setSavingId] = useState(null) // the row being saved, so its controls are disabled
  // The open form or confirm dialog: { type: 'add' } | { type: 'edit', user } | { type: 'reset', user } | null
  const [dialog, setDialog] = useState(null)
  // { title?, name, email, password } after a reset. Only kept while its dialog is open, then cleared.
  const [shownPassword, setShownPassword] = useState(null)
  // "A link … was emailed" after Add user, Reset password or Resend link (email delivery)
  const [notice, setNotice] = useState('')
  // 'email' or 'temporary_password', from GET /meta; null until known (then no "Resend link")
  const [delivery, setDelivery] = useState(null)
  const isHr = me?.role === 'hr'
  // The button that opened the current dialog. Every dialog sends focus back to it when it closes, even when one
  // dialog replaces another (form → password dialog), where "what had focus when I opened" is already gone.
  const trigger = useRef(null)

  function openDialog(event, next) {
    trigger.current = event.currentTarget
    setNotice('')
    setDialog(next)
  }

  // Loads the page in the URL; an empty page past the end (the list got shorter) goes to the new last page
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
      .get(`/users?${queryString}`, { signal: controller.signal })
      .then(({ data }) => {
        const page = pagedResult(data, { page: requestedPage, pageSize: requestedPageSize })
        const fallback = fallbackPage(page, requestedPage)
        if (fallback !== null) {
          setParamsRef.current((current) => withPaging(current, { page: fallback }), { replace: true })
          return
        }
        setLoadError('')
        setBadRequest(null)
        setResult(page)
      })
      .catch((err) => {
        if (controller.signal.aborted) return
        setLoadError(errorMessage(err))
        setBadRequest(badRequestDetails(err))
      })
    return () => controller.abort()
  }, [queryString, requestedPage, requestedPageSize, reloadKey])

  const setPage = (page) => setParams((current) => withPaging(current, { page }))
  const setPageSize = (pageSize) => setParams((current) => withPaging(current, { pageSize }), { replace: true })
  const setSort = (sort, order) => setParams((current) => withPaging(current, { sort, order }), { replace: true })
  const resetPaging = () =>
    setParams((current) => withPaging(current, Object.fromEntries(PAGING_KEYS.map((key) => [key, '']))), {
      replace: true,
    })
  const pagingProps = { sort: paging.sort, order: paging.order, onSort: setSort }

  useEffect(() => {
    // Only decides whether "Resend link" is offered; if it fails, the button simply stays hidden
    client
      .get('/meta')
      .then(({ data }) => setDelivery(data.password_delivery ?? null))
      .catch(() => {})
  }, [])

  // What the page says when a password went out by email
  const emailedNotice = (email) => `A link to set the password was emailed to ${email}. It expires in 48 hours.`

  // Sends the change and swaps the returned user into the list.
  // If it fails the list stays as it was, so the role dropdown jumps back to the saved value.
  async function updateUser(id, changes) {
    setSavingId(id)
    setActionError('')
    try {
      const { data } = await client.patch(`/users/${id}`, changes)
      setUsers((current) => current.map((u) => (u.id === id ? data : u)))
    } catch (err) {
      setActionError(errorMessage(err))
    } finally {
      setSavingId(null)
    }
  }

  // The backend also unassigns unfinished tickets when a staff member is deactivated or made an employee
  function toggleActive(u) {
    // Deactivating locks someone out, so ask first
    if (u.is_active && !window.confirm(`Deactivate ${u.name}? They will no longer be able to log in.`)) return
    updateUser(u.id, { is_active: !u.is_active })
  }

  const replaceUser = (user) => setUsers((current) => current.map((u) => (u.id === user.id ? user : u)))

  // Add: the new account shows at the top at once, then the current page is loaded again (where it really belongs
  // depends on the sort and the page), and the page says where the set-password link went. Edit: the row is updated in place; if you edited yourself, the top bar shows the new
  // name.
  function handleSaved({ user, temporaryPassword, password_delivery: passwordDelivery }) {
    setActionError('')
    if (dialog.type === 'add') {
      setResult((current) => current && { ...current, items: [user, ...current.items], total: current.total + 1 })
      setReloadKey((key) => key + 1)
      if (passwordDelivery === 'email') setNotice(emailedNotice(user.email))
      else setShownPassword({ name: user.name, email: user.email, password: temporaryPassword })
    } else {
      replaceUser(user)
      if (user.id === me.id)
        updateSession({
          ...me,
          name: user.name,
          email: user.email,
          department_id: user.department_id,
          department_name: user.department_name,
          job_title: user.job_title,
        })
    }
    setDialog(null)
  }

  async function resendLink(u) {
    setSavingId(u.id)
    setActionError('')
    setNotice('')
    try {
      const { data } = await client.post(`/users/${u.id}/resend-link`)
      replaceUser(data.user)
      setNotice(`${emailedNotice(u.email)} The previous link no longer works.`)
    } catch (err) {
      setActionError(errorMessage(err))
    } finally {
      setSavingId(null)
    }
  }

  function handleReset({ user, temporaryPassword, password_delivery: passwordDelivery }) {
    replaceUser(user)
    setDialog(null)
    if (passwordDelivery === 'email') {
      setNotice(emailedNotice(user.email))
      return
    }
    setShownPassword({
      title: `New password for ${user.name}`,
      name: user.name,
      email: user.email,
      password: temporaryPassword,
    })
  }

  const activeCount = users?.filter((u) => u.is_active).length || 0
  const total = result?.total ?? 0

  return (
    <>
      <PageHeader
        title="Users"
        subtitle={
          isHr
            ? 'Everyone with a TicketFlow account. Add and edit employees, reset their passwords, and turn their accounts on and off.'
            : 'Everyone with a TicketFlow account. Add and edit users, reset passwords, change roles, and turn accounts on and off.'
        }
        actions={
          <button type="button" className="btn btn--primary" onClick={(e) => openDialog(e, { type: 'add' })}>
            <UserPlus size={16} aria-hidden="true" />
            Add user
          </button>
        }
      />

      {(dialog?.type === 'add' || dialog?.type === 'edit') && (
        <UserDialog
          user={dialog.user ?? null}
          onSaved={handleSaved}
          onCancel={() => setDialog(null)}
          returnFocusRef={trigger}
        />
      )}
      {dialog?.type === 'reset' && (
        <ResetPasswordDialog
          user={dialog.user}
          onReset={handleReset}
          onCancel={() => setDialog(null)}
          returnFocusRef={trigger}
        />
      )}
      {shownPassword && (
        <TemporaryPasswordDialog
          title={shownPassword.title}
          name={shownPassword.name}
          email={shownPassword.email}
          password={shownPassword.password}
          onClose={() => setShownPassword(null)}
          returnFocusRef={trigger}
        />
      )}

      <section className="card">
        <div className="results-bar">
          <span aria-live="polite">
            {users === null
              ? loadError
                ? 'Users could not be loaded'
                : 'Loading users…'
              : `${rangeLabel({ page: result.page, pageSize: result.pageSize, total, count: users.length })} · ${activeCount} active${total > users.length ? ' on this page' : ''}`}
          </span>
          <SortSelect fields={SORT_FIELDS} firstOrder={FIRST_ORDER} {...pagingProps} />
        </div>

        {(loadError || actionError) && (
          <div className="card__section">
            <Alert>
              {badRequest && !actionError ? (
                <>
                  <p>{badRequest.message}</p>
                  {badRequest.details.length > 0 && (
                    <ul className="alert__list">
                      {badRequest.details.map((detail) => (
                        <li key={detail}>{detail}</li>
                      ))}
                    </ul>
                  )}
                  <button type="button" className="link-button" onClick={resetPaging}>
                    Reset sorting and pages
                  </button>
                </>
              ) : (
                actionError || loadError
              )}
            </Alert>
          </div>
        )}
        {notice && !loadError && !actionError && (
          <div className="card__section">
            <Alert tone="info">{notice}</Alert>
          </div>
        )}

        {users === null && !loadError ? (
          <Spinner label="Loading users…" />
        ) : users?.length === 0 ? (
          <EmptyState icon={UsersIcon} title="No users yet." />
        ) : (
          users && (
            <div className="table-wrap">
              <table className="table table--stack">
                <thead>
                  <tr>
                    <SortHeader field="name" label="Name" firstOrder={FIRST_ORDER.name} {...pagingProps} />
                    <SortHeader field="email" label="Email" firstOrder={FIRST_ORDER.email} {...pagingProps} />
                    <SortHeader
                      field="department"
                      label="Department"
                      firstOrder={FIRST_ORDER.department}
                      {...pagingProps}
                    />
                    <SortHeader field="role" label="Role" firstOrder={FIRST_ORDER.role} {...pagingProps} />
                    <th>Status</th>
                    <SortHeader
                      field="created_at"
                      label="Joined"
                      firstOrder={FIRST_ORDER.created_at}
                      {...pagingProps}
                    />
                    <th className="table__actions">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => {
                    // Your own row is read-only, and only the row being saved is disabled
                    const isMe = u.id === me?.id
                    const saving = savingId === u.id
                    // HR may only change employee accounts, and never anyone's role.
                    // Your own details can be edited, but not your role, active status or (here) your password.
                    const canManage = !isHr || u.role === 'employee'
                    const canEdit = canManage
                    const canReset = canManage && !isMe
                    const canToggle = canManage && !isMe
                    const canChangeRole = !isMe && !isHr
                    // Still waiting for their password (a new account, or a reset one): with email, a fresh link
                    const canResendLink =
                      delivery === 'email' && canManage && !isMe && u.is_active && u.must_change_password
                    return (
                      <tr key={u.id} className={u.is_active ? undefined : 'is-inactive'}>
                        <td>
                          <span className="person">
                            <Avatar name={u.name} size="sm" />
                            <span className="person__text">
                              <span className="person__name">
                                <span className="table__title">{u.name}</span>
                                {isMe && <span className="you-tag">You</span>}
                              </span>
                              {u.job_title && <span className="person__job">{u.job_title}</span>}
                            </span>
                          </span>
                        </td>
                        <td className="text-muted" data-label="Email">
                          {u.email}
                        </td>
                        <td className="text-muted" data-label="Department">
                          {u.department_name || '—'}
                        </td>
                        <td data-label="Role">
                          {!canChangeRole ? (
                            <span className={`role-tag role-tag--${u.role}`}>{ROLE_LABELS[u.role] || u.role}</span>
                          ) : (
                            <select
                              className="select select--sm"
                              value={u.role}
                              disabled={saving}
                              onChange={(e) => updateUser(u.id, { role: e.target.value })}
                              aria-label={`Role for ${u.name}`}
                            >
                              {ROLES.map((role) => (
                                <option key={role} value={role}>
                                  {ROLE_LABELS[role]}
                                </option>
                              ))}
                            </select>
                          )}
                        </td>
                        <td data-label="Status">
                          <span className={`badge badge--${u.is_active ? 'active' : 'inactive'}`}>
                            <span className="badge__dot" aria-hidden="true" />
                            {u.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="text-muted table__date" data-label="Joined">
                          {formatDate(u.created_at)}
                        </td>
                        <td className="table__actions">
                          {!canEdit ? (
                            <span className="text-faint">—</span>
                          ) : (
                            <div className="row-actions">
                              {/* Icon buttons on desktop (with a tooltip), labelled buttons on phones. The aria-labels name
                                  the user, so screen readers can tell the rows' buttons apart. */}
                              <button
                                type="button"
                                className="btn btn--sm btn--secondary btn--icon"
                                disabled={saving}
                                onClick={(e) => openDialog(e, { type: 'edit', user: u })}
                                aria-label={`Edit ${u.name}`}
                                title="Edit"
                              >
                                <Pencil size={14} aria-hidden="true" />
                                <span className="row-actions__text">Edit</span>
                              </button>
                              {canResendLink && (
                                <button
                                  type="button"
                                  className="btn btn--sm btn--secondary btn--icon"
                                  disabled={saving}
                                  onClick={() => resendLink(u)}
                                  aria-label={`Resend link to ${u.name}`}
                                  title="Resend link"
                                >
                                  <Mail size={14} aria-hidden="true" />
                                  <span className="row-actions__text">Resend link</span>
                                </button>
                              )}
                              {canReset && (
                                <button
                                  type="button"
                                  className="btn btn--sm btn--secondary btn--icon"
                                  disabled={saving}
                                  onClick={(e) => openDialog(e, { type: 'reset', user: u })}
                                  aria-label={`Reset password for ${u.name}`}
                                  title="Reset password"
                                >
                                  <KeyRound size={14} aria-hidden="true" />
                                  <span className="row-actions__text">Reset password</span>
                                </button>
                              )}
                              {canToggle && (
                                <button
                                  type="button"
                                  className={`btn btn--sm ${u.is_active ? 'btn--secondary' : 'btn--primary'}`}
                                  disabled={saving}
                                  onClick={() => toggleActive(u)}
                                >
                                  {u.is_active ? 'Deactivate' : 'Activate'}
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )
        )}

        {users && total > 0 && (
          <Pagination
            label="User pages"
            page={result.page}
            pageSize={result.pageSize}
            total={total}
            onPage={setPage}
            onPageSize={setPageSize}
          />
        )}
      </section>
    </>
  )
}
