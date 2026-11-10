// AuthContext.jsx – holds the logged-in user for the whole app.
// The session is the backend's httpOnly cookie, which this code can't see. So on startup the app asks the backend who
// is logged in (GET /auth/me) and shows a short "checking" screen until it answers; it never trusts anything saved in
// the browser. Nothing about the session is kept in localStorage.
import { useCallback, useEffect, useMemo, useState } from 'react'
import client, { LEGACY_STORAGE_KEYS, PASSWORD_CHANGE_REQUIRED_EVENT, SESSION_EXPIRED_EVENT } from '../api/client'
import { Spinner } from '../components/Ui'
import { AuthContext } from './auth'

// Older versions kept the token (and the user) in localStorage: remove them, they are never used again
function removeLegacyStorage() {
  try {
    for (const key of LEGACY_STORAGE_KEYS) localStorage.removeItem(key)
  } catch {
    // storage blocked (e.g. private mode): nothing to remove
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  // True until GET /auth/me has answered, so a logged-in user doesn't see the login page flash by
  const [checking, setChecking] = useState(true)
  // Why the user was signed out, shown on the login page (e.g. a refused CSRF token); cleared by the next login
  const [notice, setNotice] = useState('')

  // Startup: who does the session cookie belong to? 401 (or no answer) means nobody is logged in.
  useEffect(() => {
    removeLegacyStorage()
    let active = true
    client
      .get('/auth/me')
      .then(({ data }) => active && setUser(data))
      .catch(() => active && setUser(null))
      .finally(() => active && setChecking(false))
    return () => {
      active = false
    }
  }, [])

  // Replaces the user's details (e.g. after an admin edits their own name); the session itself is unchanged
  const updateUser = useCallback((nextUser) => setUser(nextUser), [])

  // The backend sets the session cookies; the response only tells us who logged in
  const login = useCallback(async (email, password) => {
    const { data } = await client.post('/auth/login', { email, password })
    setNotice('')
    setUser(data.user)
    return data.user
  }, [])

  // Also the way out of a temporary password: the backend clears must_change_password and returns the user.
  // Changing the password ends every session of this user; the backend gives this browser fresh session cookies in the
  // same response, so the user stays logged in without the app keeping anything.
  const changePassword = useCallback(async (currentPassword, newPassword) => {
    const { data } = await client.post('/auth/change-password', { currentPassword, newPassword })
    setUser(data.user)
    return data.user
  }, [])

  // Asks the backend to clear the session cookies, then forgets the user (also if the request fails: the user wanted
  // out, and a session the backend still has will be refused once its cookie is gone or expires)
  const logout = useCallback(async () => {
    try {
      await client.post('/auth/logout')
    } catch {
      // offline or already logged out: still log out here
    }
    setUser(null)
  }, [])

  // The API client fires this event when the backend ends the session (401, or a refused CSRF token). The backend no
  // longer accepts the session, so just drop the user (ProtectedRoute then sends them to /login), and clear the
  // cookies so a stale one isn't sent again.
  useEffect(() => {
    function sessionExpired(event) {
      setNotice(event.detail?.message || '')
      setUser(null)
      client.post('/auth/logout').catch(() => {})
    }
    window.addEventListener(SESSION_EXPIRED_EVENT, sessionExpired)
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, sessionExpired)
  }, [])

  // The password was reset while this user was logged in: flag them so ProtectedRoute sends them to /set-password
  useEffect(() => {
    function requirePasswordChange() {
      setUser((current) =>
        current && !current.must_change_password ? { ...current, must_change_password: true } : current,
      )
    }
    window.addEventListener(PASSWORD_CHANGE_REQUIRED_EVENT, requirePasswordChange)
    return () => window.removeEventListener(PASSWORD_CHANGE_REQUIRED_EVENT, requirePasswordChange)
  }, [])

  // useMemo keeps the same object between renders, so components using useAuth() only re-render when it changes
  const value = useMemo(
    () => ({
      user,
      notice,
      // Staff = agents and admins: they see and work on all tickets
      isStaff: user?.role === 'agent' || user?.role === 'admin',
      isAdmin: user?.role === 'admin',
      // Admins and HR manage accounts on the Users page. HR is not staff: for tickets, HR is an employee.
      canManageUsers: user?.role === 'admin' || user?.role === 'hr',
      login,
      changePassword,
      logout,
      updateUser,
    }),
    [user, notice, login, changePassword, logout, updateUser],
  )

  return (
    <AuthContext.Provider value={value}>
      {checking ? (
        <div className="session-check">
          <Spinner label="Checking your session…" />
        </div>
      ) : (
        children
      )}
    </AuthContext.Provider>
  )
}
