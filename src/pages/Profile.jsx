// Profile.jsx – your own account at /profile, for every role: your details (read-only, from GET /auth/me) and a link
// to the Change password page. Opened from your name in the top bar. Admins and HR change details on the Users page.
import { KeyRound } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import client, { errorMessage } from '../api/client'
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
          </section>
        </div>
      )}
    </>
  )
}
