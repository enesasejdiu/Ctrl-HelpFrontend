// ChangePassword.jsx – choose a new password (POST /auth/change-password) at /change-password.
// Forced after logging in with a temporary password (from an admin or HR): ProtectedRoute sends the user here and
// nowhere else until it's done. Otherwise it's opened from the key button in the top bar, and can be cancelled.
import { LoaderCircle } from 'lucide-react'
import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { errorMessage } from '../api/client'
import AuthShell from '../components/AuthShell'
import PasswordInput from '../components/PasswordInput'
import { Alert } from '../components/Ui'
import { useAuth } from '../context/auth'

// The backend's rules for a new password, checked here first so mistakes show without a round trip
function newPasswordProblem(password) {
  if (!password) return 'New password is required'
  if (password.length < 10) return 'New password must be at least 10 characters'
  if (password.length > 72) return 'New password must be 72 characters or less'
  if (!/[A-Za-z]/.test(password)) return 'New password must contain at least one letter'
  if (!/\d/.test(password)) return 'New password must contain at least one number'
  return null
}

export default function ChangePassword() {
  const { user, changePassword, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [invalidField, setInvalidField] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  // Read once: after a successful change the flag is cleared, but this page should still finish as it started
  const [forced] = useState(Boolean(user?.must_change_password))
  const fromLocation = location.state?.from
  const from =
    fromLocation && fromLocation.pathname !== '/change-password'
      ? `${fromLocation.pathname}${fromLocation.search || ''}${fromLocation.hash || ''}`
      : '/tickets'

  function validate() {
    if (!current)
      return ['current-password', forced ? 'Temporary password is required' : 'Current password is required']
    const problem = newPasswordProblem(next)
    if (problem) return ['new-password', problem]
    if (next === current) return ['new-password', 'New password must be different from the current one']
    if (confirm !== next) return ['confirm-password', 'The new passwords do not match']
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
      await changePassword(current, next)
      navigate(from, { replace: true })
    } catch (err) {
      setError(errorMessage(err))
      setSubmitting(false)
    }
  }

  async function handleLogout() {
    await logout() // never fails: the user is forgotten here even if the request does
    navigate('/login', { replace: true })
  }

  // Just logged out: this page renders once more before the navigation to /login takes over
  if (!user) return null

  return (
    <AuthShell
      title={forced ? 'Choose your own password' : 'Change password'}
      subtitle={
        forced
          ? 'You signed in with a temporary password. Choose a new one to continue.'
          : `Signed in as ${user.email}.`
      }
      footer={
        forced ? (
          <>
            Not you?{' '}
            <button type="button" className="link-button" onClick={handleLogout}>
              Log out
            </button>
          </>
        ) : (
          <Link to={from}>Cancel</Link>
        )
      }
    >
      <form className="form" onSubmit={handleSubmit} noValidate>
        {error && <Alert>{error}</Alert>}

        <div className="field">
          <label htmlFor="current-password">{forced ? 'Temporary password' : 'Current password'}</label>
          <PasswordInput
            id="current-password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            aria-invalid={invalidField === 'current-password' || undefined}
            required
            autoFocus
          />
        </div>

        <div className="field">
          <label htmlFor="new-password">New password</label>
          <PasswordInput
            id="new-password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            aria-invalid={invalidField === 'new-password' || undefined}
            aria-describedby="new-password-hint"
            required
          />
          <span id="new-password-hint" className="field__hint">
            At least 10 characters, with at least one letter and one number.
          </span>
        </div>

        <div className="field">
          <label htmlFor="confirm-password">Repeat new password</label>
          <PasswordInput
            id="confirm-password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            aria-invalid={invalidField === 'confirm-password' || undefined}
            required
          />
        </div>

        <button type="submit" className="btn btn--primary btn--block btn--lg" disabled={submitting}>
          {submitting && <LoaderCircle size={18} className="spin" aria-hidden="true" />}
          {submitting ? 'Saving…' : 'Save new password'}
        </button>
      </form>
    </AuthShell>
  )
}
