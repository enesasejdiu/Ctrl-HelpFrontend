// ForgotPassword.jsx – "Forgot password" at /forgot-password, linked from the sign-in page. Public.
// POST /auth/forgot-password { email }: the backend always gives the same answer, whether or not the address has an
// account (so this page can't be used to find out who has one), and emails an active account a one-time reset link.
// The current password keeps working until that link is used. When the backend has no email set up it answers
// 409 EMAIL_NOT_CONFIGURED, and the page says to ask an administrator or HR instead.
import { LoaderCircle, Mail } from 'lucide-react'
import { useState } from 'react'
import { Link, useLocation } from 'react-router'
import client, { errorMessage } from '../api/client'
import AuthShell from '../components/AuthShell'
import { Alert } from '../components/Ui'
import { t } from '../i18n'

// Loose "something@something.tld" check; the backend does the strict validation
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function ForgotPassword() {
  const location = useLocation()
  // The sign-in page passes on what was typed there
  const [email, setEmail] = useState(() => (typeof location.state?.email === 'string' ? location.state.email : ''))
  const [fieldError, setFieldError] = useState('')
  const [error, setError] = useState('') // anything that isn't about the field
  const [sentMessage, setSentMessage] = useState('') // the backend's answer once it is sent
  const [sending, setSending] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    if (!email.trim()) return setFieldError(t('login.emailRequired'))
    if (!EMAIL_PATTERN.test(email.trim())) return setFieldError(t('login.emailInvalid'))
    setFieldError('')
    setSending(true)
    try {
      const { data } = await client.post('/auth/forgot-password', { email: email.trim() })
      setSentMessage(data.message || t('forgot.sent'))
    } catch (err) {
      const { status, data } = err.response || {}
      if (data?.code === 'EMAIL_NOT_CONFIGURED') setError(t('forgot.notAvailable'))
      else if (status === 429) setError(t('forgot.rateLimited'))
      else if (status === 400 && data?.errors?.some((e) => e.field === 'email')) setFieldError(data.message)
      else setError(errorMessage(err))
    } finally {
      setSending(false)
    }
  }

  const backToSignIn = <Link to="/login">{t('forgot.backToSignIn')}</Link>

  if (sentMessage) {
    return (
      <AuthShell title={t('forgot.sentTitle')} footer={backToSignIn}>
        <Alert tone="info">{sentMessage}</Alert>
        <p className="auth__note">{t('forgot.sentHelp')}</p>
      </AuthShell>
    )
  }

  return (
    <AuthShell title={t('forgot.title')} subtitle={t('forgot.subtitle')} footer={backToSignIn}>
      <form className="form" onSubmit={handleSubmit} noValidate>
        {error && <Alert>{error}</Alert>}
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
        <button type="submit" className="btn btn--primary btn--block btn--lg" disabled={sending}>
          {sending ? <LoaderCircle size={18} className="spin" aria-hidden="true" /> : <Mail size={18} aria-hidden="true" />}
          {sending ? t('forgot.sending') : t('forgot.submit')}
        </button>
      </form>
    </AuthShell>
  )
}
