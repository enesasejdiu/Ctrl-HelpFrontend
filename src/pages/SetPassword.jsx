// SetPassword.jsx – "Set your password" at /set-password, after logging in with a temporary password
// (from an admin or HR creating or resetting the account). While must_change_password is set, ProtectedRoute sends
// every other page here and the top bar shows only the logo and Log out. A live checklist shows the backend's
// password rules; the button only works once they all pass. On success: the flag is cleared and the ticket list
// opens with "Password changed". (Changing your password later, by choice, is /change-password.)
// The same address with ?token= (the link emailed to a new account) is a different, public page: SetPasswordWithLink.
import { Check, Circle, LoaderCircle } from 'lucide-react'
import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router'
import client, { errorMessage } from '../api/client'
import PasswordInput from '../components/PasswordInput'
import { Alert, PageHeader } from '../components/Ui'
import { useAuth } from '../context/auth'
import { passwordChecklist as checklist } from '../utils/passwordRules'

export default function SetPassword() {
  const { user, updateUser } = useAuth()
  const navigate = useNavigate()
  // Read once: after the change the flag is cleared, and this page must then finish by itself (with the message)
  const [forced] = useState(Boolean(user?.must_change_password))
  const [temporary, setTemporary] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [fieldErrors, setFieldErrors] = useState({}) // { temporary?, newPassword? } from the backend
  const [error, setError] = useState('') // anything else
  const [saving, setSaving] = useState(false)

  // Only for users who still have a temporary password; everyone else changes theirs at /change-password
  if (!forced) return <Navigate to="/tickets" replace />

  const rules = checklist(newPassword, confirm)
  const ready = temporary.length > 0 && rules.every((rule) => rule.met)

  async function handleSubmit(event) {
    event.preventDefault()
    if (!ready) return
    setSaving(true)
    setError('')
    setFieldErrors({})
    try {
      const { data } = await client.post('/auth/change-password', { currentPassword: temporary, newPassword })
      updateUser(data.user)
      navigate('/tickets', { replace: true, state: { flash: 'Password changed' } })
    } catch (err) {
      const { status, data } = err.response || {}
      // A wrong temporary password: 400 INVALID_CURRENT_PASSWORD (older backends answered 401; the client doesn't
      // treat a 401 from change-password as a logout)
      if (data?.code === 'INVALID_CURRENT_PASSWORD' || (status === 401 && data?.message)) {
        setFieldErrors({ temporary: data.message })
      } else if (status === 400 && data?.errors?.length) {
        const byField = {}
        for (const e of data.errors) {
          if (e.field === 'currentPassword') byField.temporary ??= e.message
          else if (e.field === 'newPassword') byField.newPassword ??= e.message
        }
        setFieldErrors(byField)
        if (!byField.temporary && !byField.newPassword) setError(errorMessage(err))
      } else {
        setError(errorMessage(err))
      }
      setSaving(false)
    }
  }

  function fieldError(field, id) {
    return fieldErrors[field] ? (
      <span id={id} className="field__hint field__hint--error">
        {fieldErrors[field]}
      </span>
    ) : null
  }

  return (
    <>
      <PageHeader
        title="Set your password"
        subtitle="Your account uses a temporary password. Choose your own to continue."
      />

      <form className="card card--padded form set-password" onSubmit={handleSubmit} noValidate>
        {error && <Alert>{error}</Alert>}

        <div className="field">
          <label htmlFor="temporary-password">Temporary password</label>
          <PasswordInput
            id="temporary-password"
            autoComplete="current-password"
            value={temporary}
            onChange={(e) => {
              setTemporary(e.target.value)
              setFieldErrors((current) => ({ ...current, temporary: undefined }))
            }}
            aria-invalid={Boolean(fieldErrors.temporary) || undefined}
            aria-describedby={fieldErrors.temporary ? 'temporary-password-error' : undefined}
            required
            autoFocus
          />
          {fieldError('temporary', 'temporary-password-error')}
        </div>

        <div className="field">
          <label htmlFor="new-password">New password</label>
          <PasswordInput
            id="new-password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => {
              setNewPassword(e.target.value)
              setFieldErrors((current) => ({ ...current, newPassword: undefined }))
            }}
            aria-invalid={Boolean(fieldErrors.newPassword) || undefined}
            aria-describedby={fieldErrors.newPassword ? 'new-password-error password-rules' : 'password-rules'}
            maxLength={72}
            required
          />
          {fieldError('newPassword', 'new-password-error')}
        </div>

        <div className="field">
          <label htmlFor="confirm-password">Confirm new password</label>
          <PasswordInput
            id="confirm-password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            aria-describedby="password-rules"
            maxLength={72}
            required
          />
        </div>

        {/* Live checklist; each item also says "done"/"not yet" in words, not only with its icon and colour */}
        <ul id="password-rules" className="checklist" aria-label="Password rules">
          {rules.map((rule) => (
            <li key={rule.label} className={rule.met ? 'is-met' : undefined}>
              {rule.met ? <Check size={14} aria-hidden="true" /> : <Circle size={14} aria-hidden="true" />}
              {rule.label}
              <span className="sr-only">{rule.met ? ' (done)' : ' (not yet)'}</span>
            </li>
          ))}
        </ul>

        <button type="submit" className="btn btn--primary btn--block btn--lg" disabled={!ready || saving}>
          {saving && <LoaderCircle size={18} className="spin" aria-hidden="true" />}
          {saving ? 'Saving…' : 'Set password'}
        </button>
      </form>
    </>
  )
}
