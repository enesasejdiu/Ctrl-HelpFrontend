// Login.jsx – email + password sign-in. After login, returns to the page the user originally asked for.
// Includes one-click demo accounts (seeded by the backend) to make testing each role quick.
// One notice at a time above the form, the latest event winning:
// - After setting a password with an emailed link: "Password set, please log in." (info), with the email filled in.
// - ?reason=session_expired (set by ProtectedRoute after a 401 mid-session): an info notice, then the reason is taken
//   out of the URL so a reload or bookmark doesn't show it again. Unknown reasons are ignored, never displayed.
// - 423 ACCOUNT_LOCKED (5 wrong passwords): the button is disabled for that email, with a countdown, until the lock ends.
// - 429 RATE_LIMITED (too many attempts from this address): the same, for any email, when Retry-After says how long.
// - Wrong email or password stays one generic message, so the page never tells whether an email has an account.
// All texts come from src/i18n.
import { ArrowRight, Clock, LoaderCircle } from 'lucide-react'
import { Fragment, useEffect, useState } from 'react'
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router'
import { errorMessage } from '../api/client'
import AuthShell from '../components/AuthShell'
import PasswordInput from '../components/PasswordInput'
import { Alert } from '../components/Ui'
import { useAuth } from '../context/auth'
import { t, tNodes } from '../i18n'
import { returnPathFrom } from '../utils/returnPath'
import { formatWait, retryAfterSeconds } from '../utils/wait'

const DEMO_PASSWORD = 'password123'
// Loose "something@something.tld" check; the backend does the strict validation
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
// Where to go after login when there's no (safe) page to return to
const DEFAULT_PAGE = '/tickets'
// The ?reason= values this page knows, and their message
const REASONS = { session_expired: 'login.sessionExpired' }

const DEMO_ACCOUNTS = [
  { label: 'Admin', email: 'admin@ticketflow.local' },
  { label: 'IT Staff', email: 'agent1@ticketflow.local' },
  { label: 'HR', email: 'hr@ticketflow.local' },
  { label: 'Employee', email: 'employee1@ticketflow.local' },
]

const normalize = (email) => email.trim().toLowerCase()

// The notice for a failed login request. A lock or rate limit with a known length gets an `until` (an absolute time,
// so the countdown stays right even if the tab sat in the background).
function noticeForLoginError(err, email) {
  const response = err?.response
  // No answer, or the server (or the dev proxy in front of it) failed
  if (!response || response.status >= 500) return { kind: 'error', text: t('login.unreachable') }
  if (response.status === 401) return { kind: 'error', text: t('login.wrongCredentials') }
  if (response.status === 423) {
    // Retry-After has the exact seconds; the body's retryAfterMinutes (rounded up) is the fallback
    const minutes = Number(response.data?.retryAfterMinutes)
    const seconds = retryAfterSeconds(response) ?? (minutes > 0 ? minutes * 60 : null)
    return { kind: 'locked', email: normalize(email), until: seconds ? Date.now() + seconds * 1000 : null }
  }
  if (response.status === 429) {
    const seconds = retryAfterSeconds(response)
    return { kind: 'rateLimited', until: seconds ? Date.now() + seconds * 1000 : null }
  }
  // e.g. 400 (the backend's validation message) or 403 (deactivated account)
  return { kind: 'error', text: errorMessage(err) }
}

// A translated message with React elements in it, keyed so React can render the list
function Message({ id, params }) {
  return tNodes(id, params).map((part, index) => <Fragment key={index}>{part}</Fragment>)
}

function LoginNotice({ notice, now }) {
  // role="timer" is a live region that stays quiet, so the alert is read once, not again every second
  const countdown = notice.until ? <span role="timer">{formatWait(notice.until - now)}</span> : null
  switch (notice.kind) {
    case 'reason':
    case 'waitOver':
      return <Alert tone="info">{t(notice.key)}</Alert>
    case 'locked':
      return (
        <Alert tone="warning">
          <p>{countdown ? <Message id="login.locked" params={{ time: countdown }} /> : t('login.lockedNoTime')}</p>
          <p>{t('login.lockedHelp')}</p>
        </Alert>
      )
    case 'rateLimited':
      return (
        <Alert tone="warning">
          {countdown ? <Message id="login.rateLimited" params={{ time: countdown }} /> : t('login.rateLimitedNoTime')}
        </Alert>
      )
    default:
      return <Alert>{notice.text}</Alert>
  }
}

export default function Login() {
  const { user, login, clearSessionExpired } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  // After setting a password with an emailed link (SetPasswordWithLink), the email is filled in already
  const [email, setEmail] = useState(() => (typeof location.state?.email === 'string' ? location.state.email : ''))
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [invalidField, setInvalidField] = useState(null)
  // The one message above the form (see the top of this file), or null
  const [notice, setNotice] = useState(() => {
    const reason = searchParams.get('reason')
    if (reason && Object.hasOwn(REASONS, reason)) return { kind: 'reason', key: REASONS[reason] }
    // Router state, so it can't be faked with a link
    if (location.state?.notice === 'passwordSet') return { kind: 'reason', key: 'login.passwordSet' }
    return null
  })
  const [now, setNow] = useState(() => Date.now())
  const until = notice?.until ?? null
  const waiting = until !== null && now < until

  // Shown once: take ?reason= out of the URL (replacing the history entry) and keep everything else, including the
  // page to return to, which lives in the router state
  const hasReason = searchParams.has('reason')
  useEffect(() => {
    if (!hasReason || user) return
    clearSessionExpired()
    const rest = new URLSearchParams(searchParams)
    rest.delete('reason')
    const search = rest.toString()
    navigate(
      { pathname: location.pathname, search: search ? `?${search}` : '', hash: location.hash },
      { replace: true, state: location.state },
    )
  }, [hasReason, user, searchParams, location.pathname, location.hash, location.state, navigate, clearSessionExpired])

  // While a wait runs: tick once a second, and when it's over give the button back and say so
  useEffect(() => {
    if (until === null) return undefined
    function tick() {
      const time = Date.now()
      setNow(time)
      if (time >= until) {
        setNotice((current) =>
          current?.until === until
            ? { kind: 'waitOver', key: current.kind === 'locked' ? 'login.lockEnded' : 'login.rateLimitEnded' }
            : current,
        )
      }
    }
    const timer = setInterval(tick, 1000)
    // Browsers slow timers down in background tabs; catch up as soon as the tab is visible again
    document.addEventListener('visibilitychange', tick)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [until])

  // Where to go after signing in: ProtectedRoute saved the page the user wanted (with its filters) in the router
  // state before sending them here. Only a path on this site is used; otherwise the ticket list.
  const from = returnPathFrom(location.state?.from) ?? DEFAULT_PAGE

  // Logged in (already, or just now: login() sets the user before navigate() below runs, so this redirect
  // usually renders first). Both must go to the same place.
  if (user) return <Navigate to={from} replace />

  // Same rules and messages as the backend, checked here first to save a round trip
  function validate() {
    if (!email.trim()) return ['email', t('login.emailRequired')]
    if (!EMAIL_PATTERN.test(email.trim())) return ['email', t('login.emailInvalid')]
    if (!password) return ['password', t('login.passwordRequired')]
    return null
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (waiting) return
    setNotice(null)
    const problem = validate()
    setInvalidField(problem?.[0] ?? null)
    if (problem) {
      setNotice({ kind: 'error', text: problem[1] })
      document.getElementById(problem[0])?.focus()
      return
    }
    setSubmitting(true)
    try {
      await login(email.trim(), password)
      // replace: the Back button shouldn't return to the login form
      navigate(from, { replace: true })
    } catch (err) {
      setNotice(noticeForLoginError(err, email))
      setNow(Date.now())
      // Only on failure: after a success we leave this page anyway
      setSubmitting(false)
    }
  }

  // A lock belongs to one account: with another email the button is back and the lock message goes. (A rate limit is
  // for this whole address, so it stays.)
  function changeEmail(value) {
    setEmail(value)
    if (notice?.kind === 'locked' && normalize(value) !== notice.email) setNotice(null)
  }

  // Fills the form but doesn't submit it, so you can see which account is being used
  function fillDemo(demoEmail) {
    changeEmail(demoEmail)
    setPassword(DEMO_PASSWORD)
    setInvalidField(null)
    if (notice?.kind === 'error') setNotice(null)
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to report and follow your IT tickets."
      footer="No account yet? Ask your IT admin or HR to create one."
    >
      <form className="form" onSubmit={handleSubmit} noValidate>
        {notice && <LoginNotice notice={notice} now={now} />}

        <div className="field">
          <label htmlFor="email">Work email</label>
          <input
            id="email"
            type="email"
            className="input"
            autoComplete="email"
            placeholder="name@company.com"
            value={email}
            onChange={(e) => changeEmail(e.target.value)}
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

        <button type="submit" className="btn btn--primary btn--block btn--lg" disabled={submitting || waiting}>
          {waiting ? (
            <>
              <Clock size={18} aria-hidden="true" />
              {t('login.tryAgainIn', { time: formatWait(until - now) })}
            </>
          ) : (
            <>
              {submitting ? <LoaderCircle size={18} className="spin" aria-hidden="true" /> : null}
              {submitting ? t('login.submitting') : t('login.submit')}
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
