// Profile.jsx – your own account at /profile, for every role: your details (read-only, from GET /auth/me), a link
// to the Change password page, and "Log out everywhere" (POST /auth/logout-all, after a confirm). Opened from your
// name in the top bar. Admins and HR change details on the Users page.
import { KeyRound, LoaderCircle, LogOut } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router'
import client, { errorMessage } from '../api/client'
import Modal from '../components/Modal'
import { Alert, Avatar, PageHeader, Spinner } from '../components/Ui'
import { useAuth } from '../context/auth'
import { ROLE_LABELS, formatDate } from '../utils/format'

// "3 November 2026"
function formatDay(value) {
  return new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

// Fields /auth/me doesn't send today; each row only shows once the backend includes its field
const OPTIONAL_FIELDS = [
  { key: 'job_title', label: 'Job title' },
  { key: 'created_at', label: 'Member since', format: formatDay },
  { key: 'last_login_at', label: 'Last login', format: formatDate },
]

function detailRows(me) {
  const rows = [
    { label: 'Name', value: me.name },
    { label: 'Email', value: me.email },
    { label: 'Role', value: ROLE_LABELS[me.role] || me.role },
    // The name, never the id: a user without a department shows "—"
    { label: 'Department', value: me.department_name },
  ]
  for (const { key, label, format } of OPTIONAL_FIELDS) {
    if (key in me) rows.push({ label, value: me[key] && format ? format(me[key]) : me[key] })
  }
  return rows
}

export default function Profile() {
  const { updateUser } = useAuth()
  const location = useLocation()
  const [me, setMe] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    client
      .get('/auth/me')
      .then(({ data }) => {
        if (!active) return
        setMe(data)
        updateUser(data) // keeps the name in the top bar in step with what's shown here
      })
      .catch((err) => active && setError(errorMessage(err)))
    return () => {
      active = false
    }
  }, [updateUser])

  return (
    <>
      <PageHeader title="My profile" />

      {error && <Alert>{error}</Alert>}
      {!me && !error && <Spinner label="Loading your details…" />}

      {me && (
        <div className="profile-grid">
          <section className="card card--padded" aria-labelledby="profile-details">
            <div className="profile-heading">
              <Avatar name={me.name} size="lg" />
              <h2 id="profile-details" className="panel-title">
                My details
              </h2>
            </div>
            <dl className="info-list">
              {detailRows(me).map(({ label, value }) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value || '—'}</dd>
                </div>
              ))}
            </dl>
            <p className="profile-note text-muted">To change these, contact your HR or IT admin.</p>
          </section>

          <section className="card card--padded" aria-labelledby="profile-password">
            <h2 id="profile-password" className="panel-title">
              Password
            </h2>
            <p className="text-muted">Change your password regularly to keep your account safe</p>
            {/* `from` brings the user back here when they cancel or finish */}
            <Link to="/change-password" state={{ from: location }} className="btn btn--secondary profile-action">
              <KeyRound size={16} aria-hidden="true" />
              Change password
            </Link>
            <LogoutEverywhere />
          </section>
        </div>
      )}
    </>
  )
}

// "Log out everywhere": ends every session of this account, on every device, this one included, then goes to the
// login page with a message. A lost or stolen device is the usual reason, so it asks first.
function LogoutEverywhere() {
  const { logoutEverywhere } = useAuth()
  const buttonRef = useRef(null)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function confirm() {
    setBusy(true)
    setError('')
    try {
      // Forgets the user; the login check then sends this tab to /login, with the message (ProtectedRoute.jsx)
      await logoutEverywhere()
    } catch (err) {
      // Still logged in everywhere: say so, and let them try again
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <>
      <p className="text-muted profile-logout-note">Lost a device, or signed in somewhere you shouldn't have?</p>
      <button
        ref={buttonRef}
        type="button"
        className="btn btn--secondary profile-action"
        onClick={() => {
          setError('')
          setConfirming(true)
        }}
      >
        <LogOut size={16} aria-hidden="true" />
        Log out everywhere
      </button>
      {confirming && (
        <Modal
          title="Log out everywhere?"
          role="alertdialog"
          onClose={busy ? undefined : () => setConfirming(false)}
          returnFocusRef={buttonRef}
          footer={
            <>
              <button
                type="button"
                className="btn btn--secondary"
                onClick={() => setConfirming(false)}
                disabled={busy}
                data-autofocus
              >
                Cancel
              </button>
              <button type="button" className="btn btn--danger" onClick={confirm} disabled={busy}>
                {busy ? (
                  <LoaderCircle size={16} className="spin" aria-hidden="true" />
                ) : (
                  <LogOut size={16} aria-hidden="true" />
                )}
                {busy ? 'Logging out…' : 'Log out everywhere'}
              </button>
            </>
          }
        >
          {error && <Alert>{error}</Alert>}
          <p>This signs you out on all your devices, including this one.</p>
        </Modal>
      )}
    </>
  )
}
