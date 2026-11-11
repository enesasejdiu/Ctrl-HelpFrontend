// SetPasswordWithLink.jsx – /set-password?token=..., the one-time link emailed for a new account ('setup'), an
// Admin/HR reset ('reset', and again by "Resend link"), or "Forgot password" ('forgot', 1 hour). Public: the person
// has no usable password (or doesn't remember it), so there is no login. App.jsx has already taken the token out of
// the address bar (utils/linkToken.js). First the link is checked (GET /auth/set-password/validate); a link that can't
// be used (expired, already used, replaced by a newer one) says so: ask your administrator or HR for a new link, or,
// for an expired or used "Forgot password" link, request a new one at /forgot-password. A good link shows the password form with the live rule checklist, and
// POST /auth/set-password { token, new_password } sets it. On success the sign-in page opens with
// "Password set, please log in." and the email filled in.
import { Check, Circle, LoaderCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import client, { errorMessage } from '../api/client'
import AuthShell from '../components/AuthShell'
import PasswordInput from '../components/PasswordInput'
import { Alert, Spinner } from '../components/Ui'
import { passwordChecklist } from '../utils/passwordRules'

const LINK_PROBLEM_TITLES = {
  expired: 'This link has expired',
  used: 'This link has already been used',
  invalid: 'This link is not valid',
}
const ASK_FOR_A_NEW_LINK = 'Ask your administrator or HR for a new link.'
// For "Forgot password" links (purpose 'forgot'), which last only 1 hour
const REQUEST_A_NEW_LINK = 'Reset links work for 1 hour and only once.'
const TOKEN_CODES = { TOKEN_EXPIRED: 'expired', TOKEN_USED: 'used', TOKEN_INVALID: 'invalid' }

// linkToken: the one-time token from the emailed link. It is not a login token and is never stored; it only goes back
// to the backend, which keeps nothing but its hash.
export default function SetPasswordWithLink({ linkToken }) {
  const navigate = useNavigate()
  // { status: 'checking' } | { status: 'valid', purpose, email } | { status: 'expired' | 'used' | 'invalid' }
  // | { status: 'error', message } (the check itself failed, e.g. the server is down)
  const [link, setLink] = useState({ status: 'checking' })
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [fieldError, setFieldError] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    client
      .get(`/auth/set-password/validate?token=${encodeURIComponent(linkToken)}`)
      .then(({ data }) => !cancelled && setLink(data))
      .catch((err) => !cancelled && setLink({ status: 'error', message: errorMessage(err) }))
    return () => {
      cancelled = true
    }
  }, [linkToken])

  const rules = passwordChecklist(newPassword, confirm)
  const ready = rules.every((rule) => rule.met)

  async function handleSubmit(event) {
    event.preventDefault()
    if (!ready) return
    setSaving(true)
    setError('')
    setFieldError('')
    try {
      await client.post('/auth/set-password', { new_password: newPassword, token: linkToken })
      navigate('/login', { replace: true, state: { notice: 'passwordSet', email: link.email } })
    } catch (err) {
      const data = err.response?.data
      if (TOKEN_CODES[data?.code]) {
        // The link stopped working in the meantime (e.g. used in another tab, or it just expired)
        setLink((current) => ({ status: TOKEN_CODES[data.code], purpose: current.purpose }))
      } else if (data?.errors?.some((e) => e.field === 'new_password')) {
        setFieldError(data.errors.find((e) => e.field === 'new_password').message)
      } else {
        setError(errorMessage(err))
      }
      setSaving(false)
    }
  }

  if (link.status === 'checking') {
    return (
      <AuthShell title="Set your password">
        <Spinner label="Checking your link…" />
      </AuthShell>
    )
  }

  if (link.status !== 'valid') {
    return (
      <AuthShell
        title={LINK_PROBLEM_TITLES[link.status] ?? 'Set your password'}
        footer={<Link to="/login">Go to sign in</Link>}
      >
        <Alert tone={link.status === 'error' ? 'error' : 'warning'}>
          {link.status === 'error' && link.message}
          {/* A "Forgot password" link: you can simply ask for a new one yourself */}
          {link.status !== 'error' && link.purpose === 'forgot' && (
            <>
              {REQUEST_A_NEW_LINK} <Link to="/forgot-password">Request a new link</Link>
            </>
          )}
          {link.status !== 'error' && link.purpose !== 'forgot' && ASK_FOR_A_NEW_LINK}
        </Alert>
      </AuthShell>
    )
  }

  const titles = {
    reset: ['Choose a new password', `Your password was reset. Choose a new one for ${link.email}.`],
    forgot: ['Choose a new password', `Choose a new password for ${link.email}.`],
  }
  const [title, subtitle] = titles[link.purpose] ?? ['Set your password', `Choose a password for ${link.email}.`]

  return (
    <AuthShell title={title} subtitle={subtitle}>
      <form className="form" onSubmit={handleSubmit} noValidate>
        {error && <Alert>{error}</Alert>}

        <div className="field">
          <label htmlFor="new-password">New password</label>
          <PasswordInput
            id="new-password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => {
              setNewPassword(e.target.value)
              setFieldError('')
            }}
            aria-invalid={Boolean(fieldError) || undefined}
            aria-describedby={fieldError ? 'new-password-error password-rules' : 'password-rules'}
            maxLength={72}
            required
            autoFocus
          />
          {fieldError && (
            <span id="new-password-error" className="field__hint field__hint--error">
              {fieldError}
            </span>
          )}
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
    </AuthShell>
  )
}
