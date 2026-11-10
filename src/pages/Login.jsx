// Login.jsx – email + password sign-in. After login, returns to the page the user originally asked for.
// Includes one-click demo accounts (seeded by the backend) to make testing each role quick.
// The backend's login limits get their own messages: 423 ACCOUNT_LOCKED (5 wrong passwords lock the account; the
// button stays disabled for that email until the lock runs out, with a countdown) and 429 RATE_LIMITED.
import { ArrowRight, Clock, LoaderCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { errorMessage } from '../api/client'
import AuthShell from '../components/AuthShell'
import PasswordInput from '../components/PasswordInput'
import { Alert } from '../components/Ui'
import { useAuth } from '../context/auth'

const DEMO_PASSWORD = 'password123'
// Loose "something@something.tld" check; the backend does the strict validation
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const RATE_LIMITED = 'Too many login attempts. Wait a few minutes and try again.'

function lockedMessage(minutes) {
  return `Too many wrong passwords. Your account is locked for ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}.`
}

// 900000 ms → "15:00"
function countdown(ms) {
  const seconds = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

const DEMO_ACCOUNTS = [
  { label: 'Admin', email: 'admin@ticketflow.local' },
  { label: 'IT Staff', email: 'agent1@ticketflow.local' },
  { label: 'HR', email: 'hr@ticketflow.local' },
  { label: 'Employee', email: 'employee1@ticketflow.local' },
]

export default function Login() {
  const { user, login, notice } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [invalidField, setInvalidField] = useState(null)
  // After a 423: { email, until, message } for the locked account. The lock belongs to that account, so another email
  // can still sign in on this page.
  const [lock, setLock] = useState(null)
  const [now, setNow] = useState(() => Date.now())
  const locked = lock !== null && now < lock.until && email.trim().toLowerCase() === lock.email

  // Ticks once a second while there's a lock; when it runs out, the button comes back and the lock message goes
  useEffect(() => {
    if (!lock) return undefined
    const timer = setInterval(() => {
      const time = Date.now()
      setNow(time)
      if (time >= lock.until) {
        setLock(null)
        setError((current) => (current === lock.message ? '' : current))
      }
    }, 1000)
    return () => clearInterval(timer)
  }, [lock])

  // Where to go after signing in: ProtectedRoute saved the page the user wanted (with its filters) before it
  // sent them here; otherwise the ticket list
  const fromLocation = location.state?.from
  const from = fromLocation ? `${fromLocation.pathname}${fromLocation.search || ''}${fromLocation.hash || ''}` : '/tickets'

  // Logged in (already, or just now: login() sets the user before navigate() below runs, so this redirect
  // usually renders first). Both must go to the same place.
  if (user) return <Navigate to={from} replace />

  // Same rules and messages as the backend, checked here first to save a round trip
  function validate() {
    if (!email.trim()) return ['email', 'Email is required']
    if (!EMAIL_PATTERN.test(email.trim())) return ['email', 'Enter a valid email']
    if (!password) return ['password', 'Password is required']
    return null
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (locked) return
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
      await login(email.trim(), password)
      // replace: the Back button shouldn't return to the login form
      navigate(from, { replace: true })
    } catch (err) {
      const status = err.response?.status
      if (status === 423) {
        // The backend rounds the minutes up, so waiting this long is always enough
        const minutes = Math.max(1, Math.round(Number(err.response.data?.retryAfterMinutes)) || 1)
        const message = lockedMessage(minutes)
        const start = Date.now()
        setLock({ email: email.trim().toLowerCase(), until: start + minutes * 60 * 1000, message })
        setNow(start)
        setError(message)
      } else if (status === 429) {
        setError(RATE_LIMITED)
      } else {
        setError(errorMessage(err))
      }
      // Only on failure: after a success we leave this page anyway
      setSubmitting(false)
    }
  }

  // Fills the form but doesn't submit it, so you can see which account is being used
  function fillDemo(demoEmail) {
    setEmail(demoEmail)
    setPassword(DEMO_PASSWORD)
    setError('')
    setInvalidField(null)
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to report and follow your IT tickets."
      footer="No account yet? Ask your IT admin or HR to create one."
    >
      <form className="form" onSubmit={handleSubmit} noValidate>
        {error ? <Alert>{error}</Alert> : notice && <Alert>{notice}</Alert>}

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
            aria-invalid={invalidField === 'email' || undefined}
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
            aria-invalid={invalidField === 'password' || undefined}
            required
          />
        </div>

        <button type="submit" className="btn btn--primary btn--block btn--lg" disabled={submitting || locked}>
          {locked ? (
            <>
              <Clock size={18} aria-hidden="true" />
              Try again in {countdown(lock.until - now)}
            </>
          ) : (
            <>
              {submitting ? <LoaderCircle size={18} className="spin" aria-hidden="true" /> : null}
              {submitting ? 'Signing in…' : 'Sign in'}
              {!submitting && <ArrowRight size={18} aria-hidden="true" />}
            </>
          )}
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
