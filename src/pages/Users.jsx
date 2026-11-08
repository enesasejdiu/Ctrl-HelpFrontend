// Users.jsx – user management at /admin/users (admins and HR).
// Lists every account (GET /users). Admins can add, edit and reset anyone, change roles and activate/deactivate
// accounts. HR sees everyone but can only do this for employees, and never changes roles (the backend enforces both).
// On your own row you can edit your details, but not your role, active status or password (use Change password).
// "Add user" (POST /users) and "Reset password" (POST /users/:id/reset-password) show a temporary password once.
import { KeyRound, Pencil, UserPlus, Users as UsersIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import client, { errorMessage } from '../api/client'
import ResetPasswordDialog from '../components/ResetPasswordDialog'
import TemporaryPasswordDialog from '../components/TemporaryPasswordDialog'
import UserDialog from '../components/UserDialog'
import { Alert, Avatar, EmptyState, PageHeader, Spinner } from '../components/Ui'
import { useAuth } from '../context/auth'
import { ROLE_LABELS, formatDate } from '../utils/format'

const ROLES = Object.keys(ROLE_LABELS)

export default function Users() {
  const { user: me, updateUser: updateSession } = useAuth()
  const [users, setUsers] = useState(null) // null until the first load finishes
  const [loadError, setLoadError] = useState('')
  const [actionError, setActionError] = useState('')
  const [savingId, setSavingId] = useState(null) // the row being saved, so its controls are disabled
  // The open form or confirm dialog: { type: 'add' } | { type: 'edit', user } | { type: 'reset', user } | null
  const [dialog, setDialog] = useState(null)
  // { title?, name, email, password } after a create or reset. Only kept while its dialog is open, then cleared.
  const [shownPassword, setShownPassword] = useState(null)
  const isHr = me?.role === 'hr'
  // The button that opened the current dialog. Every dialog sends focus back to it when it closes, even when one
  // dialog replaces another (form → password dialog), where "what had focus when I opened" is already gone.
  const trigger = useRef(null)

  function openDialog(event, next) {
    trigger.current = event.currentTarget
    setDialog(next)
  }

  useEffect(() => {
    client
      .get('/users')
      .then(({ data }) => setUsers(data))
      .catch((err) => setLoadError(errorMessage(err)))
  }, [])

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

  // Add: the new account goes to the top of the list (newest first, like GET /users), then its password is shown.
  // Edit: the row is updated in place; if you edited yourself, the top bar shows the new name too.
  function handleSaved({ user, temporaryPassword }) {
    if (dialog.type === 'add') {
      setUsers((current) => [user, ...(current || [])])
      setShownPassword({ name: user.name, email: user.email, password: temporaryPassword })
    } else {
      replaceUser(user)
      if (user.id === me.id) updateSession({
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

  function handleReset({ user, temporaryPassword }) {
    replaceUser(user)
    setDialog(null)
    setShownPassword({ title: `New password for ${user.name}`, name: user.name, email: user.email, password: temporaryPassword })
  }

  const activeCount = users?.filter((u) => u.is_active).length || 0

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
        <UserDialog user={dialog.user ?? null} onSaved={handleSaved} onCancel={() => setDialog(null)} returnFocusRef={trigger} />
      )}
      {dialog?.type === 'reset' && (
        <ResetPasswordDialog user={dialog.user} onReset={handleReset} onCancel={() => setDialog(null)} returnFocusRef={trigger} />
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
          <span>
            {users === null
              ? loadError
                ? 'Users could not be loaded'
                : 'Loading users…'
              : `${users.length} ${users.length === 1 ? 'user' : 'users'} · ${activeCount} active`}
          </span>
        </div>

        {(loadError || actionError) && (
          <div className="card__section">
            <Alert>{loadError || actionError}</Alert>
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
                    <th>Name</th>
                    <th>Email</th>
                    <th>Department</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Joined</th>
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
      </section>
    </>
  )
}
