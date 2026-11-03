// Login.jsx – email + password sign-in. After login, returns to the page the user originally asked for.
// Includes one-click demo accounts (seeded by the backend) to make testing each role quick.
import { ArrowRight, LoaderCircle } from 'lucide-react'
import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { errorMessage } from '../api/client'
import AuthShell from '../components/AuthShell'
import PasswordInput from '../components/PasswordInput'
import { Alert } from '../components/Ui'
import { useAuth } from '../context/auth'

const DEMO_PASSWORD = 'password123'
const DEMO_ACCOUNTS = [
  { label: 'Admin', email: 'admin@ticketflow.local' },
  { label: 'IT Staff', email: 'agent1@ticketflow.local' },
  { label: 'Employee', email: 'employee1@ticketflow.local' },
]

export default function Login() {
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Already logged in: nothing to do here
  if (user) return <Navigate to="/tickets" replace />

  const from = location.state?.from?.pathname || '/tickets'

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await login(email, password)
      navigate(from, { replace: true })
    } catch (err) {
      setError(errorMessage(err))
      setSubmitting(false)
    }
  }

  function fillDemo(demoEmail) {
    setEmail(demoEmail)
    setPassword(DEMO_PASSWORD)
    setError('')
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to report and follow your IT tickets."
      footer={
        <>
          New to TicketFlow? <Link to="/register">Create an account</Link>
        </>
      }
    >
      <form className="form" onSubmit={handleSubmit} noValidate>
        {error && <Alert>{error}</Alert>}

        <div className="field">
          <label htmlFor="email">Work email</label>
          <input
            id="email"
            type="email"
            className="input"
            autoComplete="email"
            placeholder="name@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
          />
        </div>

        <div className="field">
          <label htmlFor="password">Password</label>
          <PasswordInput
            id="password"
            autoComplete="current-password"
            placeholder="Your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        <button type="submit" className="btn btn--primary btn--block btn--lg" disabled={submitting}>
          {submitting ? <LoaderCircle size={18} className="spin" aria-hidden="true" /> : null}
          {submitting ? 'Signing in…' : 'Sign in'}
          {!submitting && <ArrowRight size={18} aria-hidden="true" />}
        </button>
      </form>

      <div className="demo-accounts">
        <span className="demo-accounts__label">Demo accounts</span>
        <div className="demo-accounts__list">
          {DEMO_ACCOUNTS.map((account) => (
            <button
              key={account.email}
              type="button"
              className="chip"
              onClick={() => fillDemo(account.email)}
              title={account.email}
            >
              {account.label}
            </button>
          ))}
        </div>
      </div>
    </AuthShell>
  )
}
