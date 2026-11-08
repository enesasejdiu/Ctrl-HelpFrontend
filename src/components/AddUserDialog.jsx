// AddUserDialog.jsx – the "Add user" form on the Users page (POST /api/users).
// Admins pick any role; HR can only create employees, so for HR the role is fixed text instead of a dropdown.
// On success it hands { user, temporaryPassword } to onCreated; the page then shows the password once.
import { LoaderCircle, UserPlus } from 'lucide-react'
import { useState } from 'react'
import client, { errorMessage } from '../api/client'
import { useAuth } from '../context/auth'
import { ROLE_LABELS } from '../utils/format'
import Modal from './Modal'
import { Alert } from './Ui'

const ROLES = Object.keys(ROLE_LABELS)
const FIELDS = ['name', 'email', 'department', 'role'] // fields the backend can report errors for
const EMAIL_FORMAT = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const DUPLICATE_EMAIL = 'An account with this email already exists'

// The same rules the backend checks first, for an instant message under each field
function validate(form) {
  const errors = {}
  if (!form.name.trim()) errors.name = 'Name is required'
  if (!form.email.trim()) errors.email = 'Email is required'
  else if (!EMAIL_FORMAT.test(form.email.trim())) errors.email = 'Enter a valid email'
  return errors
}

export default function AddUserDialog({ onCreated, onCancel, returnFocusRef }) {
  const { user: me } = useAuth()
  const isHr = me?.role === 'hr'
  const [form, setForm] = useState({ name: '', email: '', department: '', role: 'employee' })
  const [fieldErrors, setFieldErrors] = useState({})
  const [error, setError] = useState('') // anything that doesn't belong to one field
  const [saving, setSaving] = useState(false)

  function update(field) {
    return (event) => {
      setForm((current) => ({ ...current, [field]: event.target.value }))
      // Typing in a field clears its message; the others stay until the next submit
      setFieldErrors((current) => ({ ...current, [field]: undefined }))
    }
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    const errors = validate(form)
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return

    setSaving(true)
    try {
      const { data } = await client.post('/users', {
        name: form.name.trim(),
        email: form.email.trim(),
        role: isHr ? 'employee' : form.role,
        department: form.department.trim() || null,
      })
      onCreated(data)
    } catch (err) {
      const status = err.response?.status
      const backendErrors = err.response?.data?.errors || []
      if (status === 409) {
        setFieldErrors({ email: DUPLICATE_EMAIL })
      } else if (status === 400 && backendErrors.some((e) => FIELDS.includes(e.field))) {
        // Each message goes under its field (first one wins); anything for other fields goes in the alert
        const byField = {}
        for (const { field, message } of backendErrors) {
          if (FIELDS.includes(field)) byField[field] ??= message
        }
        setFieldErrors(byField)
        const other = backendErrors.find((e) => !FIELDS.includes(e.field))
        if (other) setError(other.message)
      } else {
        setError(errorMessage(err))
      }
      setSaving(false)
    }
  }

  // Props that link an input to its message, so screen readers read the error with the field
  function errorProps(field) {
    return fieldErrors[field] ? { 'aria-invalid': true, 'aria-describedby': `new-user-${field}-error` } : {}
  }
  function fieldError(field) {
    return fieldErrors[field] ? (
      <span id={`new-user-${field}-error`} className="field__hint field__hint--error">
        {fieldErrors[field]}
      </span>
    ) : null
  }

  return (
    <Modal
      title="Add user"
      returnFocusRef={returnFocusRef}
      // No Escape while saving: closing then would lose the one-time password when the request succeeds
      onClose={saving ? undefined : onCancel}
      footer={
        <>
          <button type="button" className="btn btn--secondary" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
          <button type="submit" form="add-user-form" className="btn btn--primary" disabled={saving}>
            {saving ? <LoaderCircle size={16} className="spin" aria-hidden="true" /> : <UserPlus size={16} aria-hidden="true" />}
            {saving ? 'Creating…' : 'Create user'}
          </button>
        </>
      }
    >
      <form id="add-user-form" className="form" onSubmit={handleSubmit} noValidate>
        {error && <Alert>{error}</Alert>}
        <p className="text-muted">
          The new user gets a temporary password, shown once after you create the account.
        </p>

        <div className="field">
          <label htmlFor="new-user-name">Full name</label>
          <input
            id="new-user-name"
            className="input"
            value={form.name}
            onChange={update('name')}
            maxLength={100}
            autoComplete="off"
            required
            data-autofocus
            {...errorProps('name')}
          />
          {fieldError('name')}
        </div>

        <div className="field">
          <label htmlFor="new-user-email">Email</label>
          <input
            id="new-user-email"
            type="email"
            className="input"
            placeholder="name@company.com"
            value={form.email}
            onChange={update('email')}
            maxLength={150}
            autoComplete="off"
            required
            {...errorProps('email')}
          />
          {fieldError('email')}
        </div>

        <div className="field">
          <label htmlFor="new-user-department">
            Department <span className="field__optional">Optional</span>
          </label>
          <input
            id="new-user-department"
            className="input"
            value={form.department}
            onChange={update('department')}
            maxLength={100}
            {...errorProps('department')}
          />
          {fieldError('department')}
        </div>

        {isHr ? (
          <div className="field">
            <span className="field__label">Role</span>
            <span className="static-value">{ROLE_LABELS.employee}</span>
            <span className="field__hint">HR can only create employee accounts.</span>
          </div>
        ) : (
          <div className="field">
            <label htmlFor="new-user-role">Role</label>
            <select id="new-user-role" className="select" value={form.role} onChange={update('role')} {...errorProps('role')}>
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABELS[role]}
                </option>
              ))}
            </select>
            {fieldError('role')}
          </div>
        )}
      </form>
    </Modal>
  )
}
