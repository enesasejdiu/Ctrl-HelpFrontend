// UserDialog.jsx – the "Add user" and "Edit user" form on the Users page.
// Add (no `user`): POST /users, then onSaved(response): { user, password_delivery } plus temporaryPassword when the
// backend has no email set up; the Users page shows the password once or says a link was emailed.
// Edit (`user` given): prefilled; PATCH /users/:id with only the fields that changed, then onSaved({ user }).
// The role is a dropdown only for admins, and never on their own account; otherwise it is shown as fixed text
// (HR can only create employees and can never change roles).
// The department is picked from GET /departments and saved as department_id (null = no department).
// The job title is optional free text; clearing it on edit sends "" (the backend stores that as no job title).
import { LoaderCircle, Save, UserPlus } from 'lucide-react'
import { useEffect, useState } from 'react'
import client, { errorMessage } from '../api/client'
import { useAuth } from '../context/auth'
import { ROLE_LABELS } from '../utils/format'
import Modal from './Modal'
import { Alert } from './Ui'

const ROLES = Object.keys(ROLE_LABELS)
const FIELDS = ['name', 'email', 'department_id', 'job_title', 'role'] // fields the backend can report errors for
const JOB_TITLE_MAX = 100
const EMAIL_FORMAT = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const DUPLICATE_EMAIL = 'An account with this email already exists'

// The same rules the backend checks first, for an instant message under each field
function validate(form) {
  const errors = {}
  if (!form.name.trim()) errors.name = 'Name is required'
  if (!form.email.trim()) errors.email = 'Email is required'
  else if (!EMAIL_FORMAT.test(form.email.trim())) errors.email = 'Enter a valid email'
  if (form.job_title.trim().length > JOB_TITLE_MAX)
    errors.job_title = `Job title must be ${JOB_TITLE_MAX} characters or less`
  return errors
}

// What the form would save, cleaned up the way the backend stores it. The department select holds the id as text.
function cleaned(form) {
  return {
    name: form.name.trim(),
    email: form.email.trim(),
    department_id: form.department_id ? Number(form.department_id) : null,
    job_title: form.job_title.trim(),
    role: form.role,
  }
}

export default function UserDialog({ user = null, onSaved, onCancel, returnFocusRef }) {
  const { user: me } = useAuth()
  const isEdit = user !== null
  const canPickRole = me?.role === 'admin' && !(isEdit && user.id === me.id)
  const [form, setForm] = useState(() => ({
    name: user?.name ?? '',
    email: user?.email ?? '',
    department_id: user?.department_id ? String(user.department_id) : '',
    job_title: user?.job_title ?? '',
    role: user?.role ?? 'employee',
  }))
  // null while loading; if loading fails, only the user's current department is offered, so saving can't clear it
  const [departments, setDepartments] = useState(null)
  const [departmentsError, setDepartmentsError] = useState(false)
  const [fieldErrors, setFieldErrors] = useState({})
  const [error, setError] = useState('') // anything that doesn't belong to one field
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let current = true
    client
      .get('/departments')
      .then(({ data }) => current && setDepartments(data))
      .catch(() => current && setDepartmentsError(true))
    return () => {
      current = false
    }
  }, [])
  const currentDepartment = user?.department_id ? [{ id: user.department_id, name: user.department_name }] : []
  const departmentOptions = departments ?? currentDepartment

  // Edit: only the fields that differ from the saved user. Add: everything (HR always creates employees), leaving
  // out an empty job title.
  function changes() {
    const { job_title: jobTitle, ...next } = cleaned(form)
    if (!isEdit)
      return { ...next, ...(jobTitle && { job_title: jobTitle }), role: canPickRole ? next.role : 'employee' }
    next.job_title = jobTitle
    const saved = {
      name: user.name,
      email: user.email,
      department_id: user.department_id ?? null,
      job_title: user.job_title ?? '',
      role: user.role,
    }
    return Object.fromEntries(
      Object.entries(next).filter(([field, value]) => (field !== 'role' || canPickRole) && value !== saved[field]),
    )
  }
  const unchanged = isEdit && Object.keys(changes()).length === 0

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
    if (Object.keys(errors).length > 0 || unchanged) return

    setSaving(true)
    try {
      if (isEdit) {
        const { data } = await client.patch(`/users/${user.id}`, changes())
        onSaved({ user: data })
      } else {
        const { data } = await client.post('/users', changes())
        onSaved(data)
      }
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
    return fieldErrors[field] ? { 'aria-invalid': true, 'aria-describedby': `user-${field}-error` } : {}
  }
  function fieldError(field) {
    return fieldErrors[field] ? (
      <span id={`user-${field}-error`} className="field__hint field__hint--error">
        {fieldErrors[field]}
      </span>
    ) : null
  }

  const SubmitIcon = isEdit ? Save : UserPlus
  const savingLabel = isEdit ? 'Saving…' : 'Creating…'
  const submitLabel = isEdit ? 'Save changes' : 'Create user'
  let roleNote = null
  if (!canPickRole) {
    if (!isEdit) roleNote = 'HR can only create employee accounts.'
    else if (user.id === me?.id) roleNote = "You can't change your own role."
    else roleNote = 'Only admins can change roles.'
  }

  return (
    <Modal
      title={isEdit ? `Edit ${user.name}` : 'Add user'}
      // No Escape while saving: when adding, closing then would lose the one-time password
      onClose={saving ? undefined : onCancel}
      returnFocusRef={returnFocusRef}
      footer={
        <>
          <button type="button" className="btn btn--secondary" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
          <button type="submit" form="user-form" className="btn btn--primary" disabled={saving || unchanged}>
            {saving ? (
              <LoaderCircle size={16} className="spin" aria-hidden="true" />
            ) : (
              <SubmitIcon size={16} aria-hidden="true" />
            )}
            {saving ? savingLabel : submitLabel}
          </button>
        </>
      }
    >
      <form id="user-form" className="form" onSubmit={handleSubmit} noValidate>
        {error && <Alert>{error}</Alert>}
        {!isEdit && (
          <p className="text-muted">The new user gets a temporary password, shown once after you create the account.</p>
        )}

        <div className="field">
          <label htmlFor="user-name">Full name</label>
          <input
            id="user-name"
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
          <label htmlFor="user-email">Email</label>
          <input
            id="user-email"
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
          <label htmlFor="user-department_id">
            Department <span className="field__optional">Optional</span>
          </label>
          <select
            id="user-department_id"
            className="select"
            value={form.department_id}
            onChange={update('department_id')}
            disabled={departments === null && !departmentsError}
            {...errorProps('department_id')}
          >
            <option value="">
              {departments === null && !departmentsError ? 'Loading departments…' : 'No department'}
            </option>
            {departmentOptions.map((d) => (
              <option key={d.id} value={String(d.id)}>
                {d.name}
              </option>
            ))}
          </select>
          {fieldError('department_id')}
          {departmentsError && !fieldErrors.department_id && (
            <span className="field__hint">Departments could not be loaded, so only the current one is shown.</span>
          )}
        </div>

        <div className="field">
          <label htmlFor="user-job_title">
            Job title <span className="field__optional">Optional</span>
          </label>
          <input
            id="user-job_title"
            className="input"
            placeholder="e.g. Accountant"
            value={form.job_title}
            onChange={update('job_title')}
            maxLength={JOB_TITLE_MAX}
            autoComplete="off"
            {...errorProps('job_title')}
          />
          {fieldError('job_title')}
        </div>

        {canPickRole ? (
          <div className="field">
            <label htmlFor="user-role">Role</label>
            <select
              id="user-role"
              className="select"
              value={form.role}
              onChange={update('role')}
              {...errorProps('role')}
            >
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABELS[role]}
                </option>
              ))}
            </select>
            {fieldError('role')}
          </div>
        ) : (
          <div className="field">
            <span className="field__label">Role</span>
            <span className="static-value">{ROLE_LABELS[form.role] || form.role}</span>
            <span className="field__hint">{roleNote}</span>
          </div>
        )}
      </form>
    </Modal>
  )
}
