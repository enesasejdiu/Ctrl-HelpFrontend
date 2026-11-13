// ForgotPassword.jsx – "Forgot password" at /forgot-password, linked from the sign-in page when email is set up. Public.
// POST /auth/forgot-password { email }. Whatever happened on the server (an account or not, an email sent or not),
// the page shows the same confirmation, so it can't be used to find out who has an account. Only two answers differ,
// and neither depends on an account: 422 (the email's format; shown under the field) and 429 (too many requests from
// this address; a countdown from Retry-After, with the button disabled until it ends). When the server can't be
// reached at all, it says so, because then nothing was asked.
import { Clock, LoaderCircle, Mail } from 'lucide-react'
import { Fragment, useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router'
import client from '../api/client'
import AuthShell from '../components/AuthShell'
import { Alert } from '../components/Ui'
import { t, tNodes } from '../i18n'
import { formatWait, retryAfterSeconds } from '../utils/wait'

// Loose "something@something.tld" check; the backend does the strict validation
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function ForgotPassword() {
  const location = useLocation()
  // The sign-in page passes on what was typed there
  const [email, setEmail] = useState(() => (typeof location.state?.email === 'string' ? location.state.email : ''))
  const [fieldError, setFieldError] = useState('')
  const [error, setError] = useState('') // the server couldn't be reached
  const [sent, setSent] = useState(false)
  const [sending, setSending] = useState(false)
  // 429: when the wait is over (an absolute time, so the countdown stays right in a background tab), or null
  const [until, setUntil] = useState(null)
  const [limited, setLimited] = useState(false) // 429 without a known length
  const [now, setNow] = useState(() => Date.now())
  const waiting = until !== null && now < until

  useEffect(() => {
    if (until === null) return undefined
    const tick = () => {
      const time = Date.now()
      setNow(time)
      if (time >= until) setUntil(null)
    }
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [until])

  async function handleSubmit(event) {
    event.preventDefault()
    if (sending || waiting) return
    setError('')
    setLimited(false)
    if (!email.trim()) return setFieldError(t('login.emailRequired'))
    if (!EMAIL_PATTERN.test(email.trim())) return setFieldError(t('login.emailInvalid'))
    setFieldError('')
    setSending(true)
    try {
      await client.post('/auth/forgot-password', { email: email.trim() })
      setSent(true)
    } catch (err) {
      const response = err.response
      if (!response) {
        setError(t('forgot.unreachable'))
      } else if (response.status === 422) {
        setFieldError(response.data?.errors?.find((e) => e.field === 'email')?.message ?? t('login.emailInvalid'))
      } else if (response.status === 429) {
        const seconds = retryAfterSeconds(response)
        if (seconds) {
          // One clock reading for both, so the first countdown shows exactly Retry-After (two readings a few ms apart
          // made 15 minutes round up to "about 16 minutes")
          const start = Date.now()
          setNow(start)
          setUntil(start + seconds * 1000)
        } else {
          setLimited(true)
        }
      } else {
        // Anything else still gets the same confirmation: the page never hints at what happened on the server
        setSent(true)
      }
    } finally {
      setSending(false)
    }
  }

  const backToSignIn = <Link to="/login">{t('forgot.backToSignIn')}</Link>

  if (sent) {
    return (
      <AuthShell title={t('forgot.sentTitle')} footer={backToSignIn}>
        <Alert tone="info">{t('forgot.sent')}</Alert>
        <p className="auth__note">{t('forgot.sentHelp')}</p>
      </AuthShell>
    )
  }

  return (
    <AuthShell title={t('forgot.title')} subtitle={t('forgot.subtitle')} footer={backToSignIn}>
      <form className="form" onSubmit={handleSubmit} noValidate>
        {error && <Alert>{error}</Alert>}
        {(waiting || limited) && (
          <Alert tone="warning">
            {waiting ? (
              <>
                {tNodes('forgot.rateLimited', { time: <span role="timer">{formatWait(until - now)}</span> }).map(
                  (part, index) => (
                    <Fragment key={index}>{part}</Fragment>
                  ),
                )}
              </>
            ) : (
              t('forgot.rateLimitedNoTime')
            )}
          </Alert>
        )}
        <div className="field">
          <label htmlFor="forgot-email">{t('forgot.emailLabel')}</label>
          <input
            id="forgot-email"
            className="input"
            type="email"
            autoComplete="email"
            placeholder="you@company.com"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value)
              setFieldError('')
            }}
            aria-invalid={Boolean(fieldError) || undefined}
            aria-describedby={fieldError ? 'forgot-email-error' : undefined}
            required
            autoFocus
          />
          {fieldError && (
            <span id="forgot-email-error" className="field__hint field__hint--error">
              {fieldError}
            </span>
          )}
        </div>
        <button type="submit" className="btn btn--primary btn--block btn--lg" disabled={sending || waiting}>
          {waiting ? (
            <>
              <Clock size={18} aria-hidden="true" />
              {t('forgot.tryAgainIn', { time: formatWait(until - now) })}
            </>
          ) : (
            <>
              {sending ? (
                <LoaderCircle size={18} className="spin" aria-hidden="true" />
              ) : (
                <Mail size={18} aria-hidden="true" />
              )}
              {sending ? t('forgot.sending') : t('forgot.submit')}
            </>
          )}
        </button>
      </form>
    </AuthShell>
  )
}
