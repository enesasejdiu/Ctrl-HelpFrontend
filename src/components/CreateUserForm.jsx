// CreateUserForm.jsx – the "New user" form on the Users page (POST /users).
// The server makes a temporary password and returns it once; onCreated receives { user, temporaryPassword }.
// `roles` is what the logged-in user may create: admins any role, HR only employees (the backend enforces it too).
import { LoaderCircle } from 'lucide-react'
import { useState } from 'react'
import client, { errorMessage } from '../api/client'
import { ROLE_LABELS } from '../utils/format'
import { Alert } from './Ui'

// Loose "something@something.tld" check; the backend does the strict validation
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function CreateUserForm({ roles, onCreated, onCancel }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [department, setDepartment] = useState('')
  const [role, setRole] = useState(roles[0])
  const [error, setError] = useState('')
  const [invalidField, setInvalidField] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  // Same rules and messages as the backend
  function validate() {
    if (!name.trim()) return ['new-user-name', 'Name is required']
    if (name.trim().length > 100) return ['new-user-name', 'Name must be 100 characters or less']
    if (!email.trim()) return ['new-user-email', 'Email is required']
    if (!EMAIL_PATTERN.test(email.trim())) return ['new-user-email', 'Enter a valid email']
    if (department.trim().length > 100) return ['new-user-department', 'Department must be 100 characters or less']
    return null
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    const problem = validate()
    setInvalidField(problem?.[0] ?? null)
    if (problem) {
      setError(problem[1])
      document.getElementById(problem[0])?.focus()
      return
    }
    setSubmitting(true)
    try {
      const body = { name: name.trim(), email: email.trim(), role, department: department.trim() || null }
      const { data } = await client.post('/users', body)
      onCreated(data)
    } catch (err) {
      setError(errorMessage(err))
      setSubmitting(false)
    }
  }

  return (
    <form className="form create-user" onSubmit={handleSubmit} noValidate aria-label="New user">
      {error && <Alert>{error}</Alert>}

      <div className="create-user__grid">
        <div className="field">
          <label htmlFor="new-user-name">Name</label>
          <input
            id="new-user-name"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={invalidField === 'new-user-name' || undefined}
            autoComplete="off"
            required
            autoFocus
          />
        </div>

        <div className="field">
          <label htmlFor="new-user-email">Work email</label>
          <input
            id="new-user-email"
            type="email"
            className="input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={invalidField === 'new-user-email' || undefined}
            autoComplete="off"
            required
          />
        </div>

        <div className="field">
          <label htmlFor="new-user-department">
            Department <span className="text-faint">(optional)</span>
          </label>
          <input
            id="new-user-department"
            className="input"
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            aria-invalid={invalidField === 'new-user-department' || undefined}
          />
        </div>

        <div className="field">
          <label htmlFor="new-user-role">Role</label>
          <select
            id="new-user-role"
            className="select"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            disabled={roles.length === 1}
            aria-describedby={roles.length === 1 ? 'new-user-role-hint' : undefined}
          >
            {roles.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
          {roles.length === 1 && (
            <span id="new-user-role-hint" className="field__hint">
              HR can create employee accounts. Ask an admin for other roles.
            </span>
          )}
        </div>
      </div>

      <p className="field__hint">
        A temporary password is created for the new account. They choose their own when they first sign in.
      </p>

      <div className="form__actions">
        <button type="button" className="btn btn--secondary" onClick={onCancel} disabled={submitting}>
          Cancel
        </button>
        <button type="submit" className="btn btn--primary" disabled={submitting}>
          {submitting && <LoaderCircle size={16} className="spin" aria-hidden="true" />}
          {submitting ? 'Creating…' : 'Create user'}
        </button>
      </div>
    </form>
  )
}
