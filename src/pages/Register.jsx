// Register.jsx – self sign-up. New accounts are always employees (the backend enforces this).
import { ArrowRight, LoaderCircle } from 'lucide-react'
import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { errorMessage } from '../api/client'
import AuthShell from '../components/AuthShell'
import PasswordInput from '../components/PasswordInput'
import { Alert } from '../components/Ui'
import { useAuth } from '../context/auth'

const MIN_PASSWORD = 6

export default function Register() {
  const { user, register } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ name: '', email: '', department: '', password: '' })
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Already logged in: this also sends the user on right after a successful sign-up
  if (user) return <Navigate to="/tickets" replace />

  // One change handler for every field: update('email') returns the handler for the email input
  function update(field) {
    return (event) => setForm((current) => ({ ...current, [field]: event.target.value }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    // Check the same rules as the backend first, for an instant message
    if (!form.name.trim() || !form.email.trim() || !form.password) {
      setError('Name, email and password are required')
      return
    }
    if (form.password.length < MIN_PASSWORD) {
      setError(`Password must be at least ${MIN_PASSWORD} characters`)
      return
    }
    setSubmitting(true)
    try {
      // The backend returns a token too, so the new user is logged in straight away
      await register(form)
      navigate('/tickets', { replace: true })
    } catch (err) {
      setError(errorMessage(err))
      setSubmitting(false)
    }
  }

  const passwordTooShort = form.password.length > 0 && form.password.length < MIN_PASSWORD

  return (
    <AuthShell
      title="Create your account"
      subtitle="Get help from the IT team in a few clicks."
      footer={
        <>
          Already have an account? <Link to="/login">Sign in</Link>
        </>
      }
    >
      <form className="form" onSubmit={handleSubmit} noValidate>
        {error && <Alert>{error}</Alert>}

        <div className="field">
          <label htmlFor="name">Full name</label>
          <input id="name" className="input" autoComplete="name" placeholder="Jane Doe" value={form.name} onChange={update('name')} required autoFocus />
        </div>

        <div className="field">
          <label htmlFor="email">Work email</label>
          <input id="email" type="email" className="input" autoComplete="email" placeholder="name@company.com" value={form.email} onChange={update('email')} required />
        </div>

        <div className="field">
          <label htmlFor="department">
            Department <span className="field__optional">Optional</span>
          </label>
          <input id="department" className="input" autoComplete="organization-title" placeholder="e.g. Finance" value={form.department} onChange={update('department')} />
        </div>

        <div className="field">
          <label htmlFor="password">Password</label>
          <PasswordInput
            id="password"
            autoComplete="new-password"
            placeholder="At least 6 characters"
            value={form.password}
            onChange={update('password')}
            minLength={MIN_PASSWORD}
            required
            aria-describedby="password-hint"
          />
          <span id="password-hint" className={`field__hint${passwordTooShort ? ' field__hint--error' : ''}`}>
            Use at least {MIN_PASSWORD} characters.
          </span>
        </div>

        <button type="submit" className="btn btn--primary btn--block btn--lg" disabled={submitting}>
          {submitting ? <LoaderCircle size={18} className="spin" aria-hidden="true" /> : null}
          {submitting ? 'Creating account…' : 'Create account'}
          {!submitting && <ArrowRight size={18} aria-hidden="true" />}
        </button>
      </form>
    </AuthShell>
  )
}
