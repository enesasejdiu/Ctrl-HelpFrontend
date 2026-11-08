// Users.jsx – user management at /admin/users (admins and HR).
// Lists every account (GET /users) and creates new ones (POST /users) with a temporary password.
// Admins change any account: role and active status (PATCH /users/:id), and reset its password
// (POST /users/:id/reset-password). HR does the same for employee accounts only, and never changes roles; other
// rows are read-only for HR. The backend enforces all of this; the page just doesn't offer what would be refused.
// Your own row is read-only too: the backend refuses changes to your own account here.
import { UserPlus, Users as UsersIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import client, { errorMessage } from '../api/client'
import CreateUserForm from '../components/CreateUserForm'
import TemporaryPassword from '../components/TemporaryPassword'
import { Alert, Avatar, EmptyState, PageHeader, Spinner } from '../components/Ui'
import { useAuth } from '../context/auth'
import { ROLE_LABELS, formatDate } from '../utils/format'

const ROLES = Object.keys(ROLE_LABELS)

export default function Users() {
  const { user: me, isAdmin } = useAuth()
  const [users, setUsers] = useState(null) // null until the first load finishes
  const [loadError, setLoadError] = useState('')
  const [actionError, setActionError] = useState('')
  const [savingId, setSavingId] = useState(null) // the row being saved, so its controls are disabled
  const [creating, setCreating] = useState(false)
  // { user, password, reason: 'created' | 'reset' }: the temporary password to hand over, shown until "Done"
  const [issued, setIssued] = useState(null)

  useEffect(() => {
    client
      .get('/users')
      .then(({ data }) => setUsers(data))
      .catch((err) => setLoadError(errorMessage(err)))
  }, [])

  // Admins change any account but their own; HR only employee accounts
  const canChange = (u) => u.id !== me?.id && (isAdmin || u.role === 'employee')
  const replaceUser = (updated) => setUsers((current) => current.map((u) => (u.id === updated.id ? updated : u)))

  // Sends the change and swaps the returned user into the list.
  // If it fails the list stays as it was, so the role dropdown jumps back to the saved value.
  async function updateUser(id, changes) {
    setSavingId(id)
    setActionError('')
    try {
      const { data } = await client.patch(`/users/${id}`, changes)
      replaceUser(data)
    } catch (err) {
      setActionError(errorMessage(err))
    } finally {
      setSavingId(null)
    }
  }

  // The backend also unassigns unfinished tickets when a staff member is deactivated or moved to a non-staff role
  function toggleActive(u) {
    // Deactivating locks someone out, so ask first
    if (u.is_active && !window.confirm(`Deactivate ${u.name}? They will no longer be able to log in.`)) return
    updateUser(u.id, { is_active: !u.is_active })
  }

  async function resetPassword(u) {
    if (!window.confirm(`Reset the password of ${u.name}? Their current password stops working right away.`)) return
    setSavingId(u.id)
    setActionError('')
    try {
      const { data } = await client.post(`/users/${u.id}/reset-password`)
      replaceUser(data.user)
      setIssued({ user: data.user, password: data.temporaryPassword, reason: 'reset' })
    } catch (err) {
      setActionError(errorMessage(err))
    } finally {
      setSavingId(null)
    }
  }

  function handleCreated({ user, temporaryPassword }) {
    setUsers((current) => [user, ...(current || [])]) // newest first, like the list from the server
    setCreating(false)
    setIssued({ user, password: temporaryPassword, reason: 'created' })
  }

  function startCreating() {
    setIssued(null)
    setActionError('')
    setCreating(true)
  }

  const activeCount = users?.filter((u) => u.is_active).length || 0

  return (
    <>
      <PageHeader
        title="Users"
        subtitle={
          isAdmin
            ? 'Everyone with a TicketFlow account. Create accounts, change roles, reset passwords and turn accounts on and off.'
            : 'Everyone with a TicketFlow account. Create employee accounts, reset their passwords and turn them on and off.'
        }
        actions={
          !creating && (
            <button type="button" className="btn btn--primary" onClick={startCreating}>
              <UserPlus size={16} aria-hidden="true" />
              New user
            </button>
          )
        }
      />

      {creating && (
        <section className="card card--padded users__panel">
          <h2 className="panel-title">New user</h2>
          <CreateUserForm roles={isAdmin ? ROLES : ['employee']} onCreated={handleCreated} onCancel={() => setCreating(false)} />
        </section>
      )}

      {issued && (
        <section className="users__panel">
          <TemporaryPassword {...issued} onDone={() => setIssued(null)} />
        </section>
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
                    const isMe = u.id === me?.id
                    const editable = canChange(u)
                    const saving = savingId === u.id
                    return (
                      <tr key={u.id} className={u.is_active ? undefined : 'is-inactive'}>
                        <td>
                          <span className="person">
                            <Avatar name={u.name} size="sm" />
                            <span className="table__title">{u.name}</span>
                            {isMe && <span className="you-tag">You</span>}
                          </span>
                        </td>
                        <td className="text-muted" data-label="Email">
                          {u.email}
                        </td>
                        <td className="text-muted" data-label="Department">
                          {u.department || '—'}
                        </td>
                        <td data-label="Role">
                          {/* Only admins change roles */}
                          {isAdmin && editable ? (
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
                          ) : (
                            <span className={`role-tag role-tag--${u.role}`}>{ROLE_LABELS[u.role] || u.role}</span>
                          )}
                        </td>
                        <td data-label="Status">
                          <span className="status-cell">
                            <span className={`badge badge--${u.is_active ? 'active' : 'inactive'}`}>
                              <span className="badge__dot" aria-hidden="true" />
                              {u.is_active ? 'Active' : 'Inactive'}
                            </span>
                            {u.must_change_password && (
                              <span className="temp-tag" title="Has not chosen their own password yet">
                                Temporary password
                              </span>
                            )}
                          </span>
                        </td>
                        <td className="text-muted table__date" data-label="Joined">
                          {formatDate(u.created_at)}
                        </td>
                        <td className="table__actions">
                          {editable ? (
                            <span className="row-actions">
                              <button
                                type="button"
                                className="btn btn--sm btn--secondary"
                                disabled={saving}
                                onClick={() => resetPassword(u)}
                                aria-label={`Reset password for ${u.name}`}
                                title="Reset password"
                              >
                                Reset
                              </button>
                              <button
                                type="button"
                                className={`btn btn--sm ${u.is_active ? 'btn--secondary' : 'btn--primary'}`}
                                disabled={saving}
                                onClick={() => toggleActive(u)}
                              >
                                {u.is_active ? 'Deactivate' : 'Activate'}
                              </button>
                            </span>
                          ) : (
                            <span className="text-faint">—</span>
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
