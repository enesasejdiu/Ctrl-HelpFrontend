// Users.jsx – user management at /admin/users (admin only).
// Lists every account (GET /users). Admins can change a role or activate/deactivate an account (PATCH /users/:id).
// The admin's own row is read-only: the backend refuses changes to your own account, so we don't offer them.
import { Users as UsersIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import client, { errorMessage } from '../api/client'
import { Alert, Avatar, EmptyState, PageHeader, Spinner } from '../components/Ui'
import { useAuth } from '../context/auth'
import { ROLE_LABELS, formatDate } from '../utils/format'

const ROLES = Object.keys(ROLE_LABELS)

export default function Users() {
  const { user: me } = useAuth()
  const [users, setUsers] = useState(null) // null until the first load finishes
  const [loadError, setLoadError] = useState('')
  const [actionError, setActionError] = useState('')
  const [savingId, setSavingId] = useState(null) // the row being saved, so its controls are disabled

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

  const activeCount = users?.filter((u) => u.is_active).length || 0

  return (
    <>
      <PageHeader title="Users" subtitle="Everyone with a TicketFlow account. Change roles or turn accounts on and off." />

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
                          {isMe ? (
                            <span className={`role-tag role-tag--${u.role}`}>{ROLE_LABELS[u.role]}</span>
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
                          {isMe ? (
                            <span className="text-faint">—</span>
                          ) : (
                            <button
                              type="button"
                              className={`btn btn--sm ${u.is_active ? 'btn--secondary' : 'btn--primary'}`}
                              disabled={saving}
                              onClick={() => toggleActive(u)}
                            >
                              {u.is_active ? 'Deactivate' : 'Activate'}
                            </button>
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
