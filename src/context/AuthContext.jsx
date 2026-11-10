// AuthContext.jsx – holds the logged-in user for the whole app, in memory only.
// The session itself is an httpOnly cookie that only the browser and the backend see. Whether someone is logged in is
// decided on startup by asking the backend (GET /auth/me); until it answers, a loading screen is shown instead of the
// app, so protected pages neither flash nor redirect to /login by mistake.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import client, { PASSWORD_CHANGE_REQUIRED_EVENT, SESSION_EXPIRED_EVENT } from '../api/client'
import { Spinner } from '../components/Ui'
import { setErrorUser } from '../errors/logger'
import { AuthContext } from './auth'
import { removeLegacySession } from './legacySession'

export const CHECKING_SESSION_LABEL = 'Checking your session…'

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  // True until the startup /auth/me check has answered (either way)
  const [checking, setChecking] = useState(true)
  // True when a logged-in user was logged out without choosing to (a 401 mid-session), so ProtectedRoute can send them
  // to /login?reason=session_expired and the login page can say why. Not set by logging out, nor by the startup check
  // finding no session (that's someone who simply wasn't logged in).
  const [sessionExpired, setSessionExpired] = useState(false)
  // The user as of the last render, and whether a logout is under way, for the 401 handler below (it runs outside
  // React's render, from an event)
  const userRef = useRef(null)
  const loggingOut = useRef(false)
  useEffect(() => {
    userRef.current = user
  }, [user])
  // Error reports carry the user's id (nothing else about them). Set while rendering, not in an effect: a page that
  // crashes on its first render is caught (and logged) before this provider's effects run. Repeating it is harmless.
  setErrorUser(user?.id)

  // Startup: ask the backend who the session cookie belongs to. 200 = logged in; 401 (or no answer) = logged out.
  useEffect(() => {
    removeLegacySession()
    let active = true
    client
      .get('/auth/me')
      .then(({ data }) => active && setUser(data))
      .catch(() => {}) // logged out; the login page shows next
      .finally(() => active && setChecking(false))
    return () => {
      active = false
    }
  }, [])

  // Replaces the user's details (e.g. after they edit their own profile); the session cookie stays the same
  const updateUser = useCallback((nextUser) => setUser(nextUser), [])

  // The session ended on the server (401): forget the user, and ProtectedRoute redirects to /login. Only a session that
  // existed can expire: a 401 for someone not logged in (the startup check) or during their own logout says nothing.
  const clearSession = useCallback(() => {
    if (userRef.current && !loggingOut.current) setSessionExpired(true)
    setUser(null)
  }, [])

  // The login page has told the user their session expired; later redirects to /login shouldn't repeat it
  const clearSessionExpired = useCallback(() => setSessionExpired(false), [])

  // Logs out on the backend (which clears the cookies), and forgets the user here even if that request fails
  const logout = useCallback(async () => {
    loggingOut.current = true
    setSessionExpired(false)
    try {
      await client.post('/auth/logout')
    } catch {
      // Offline or the server is down: still log out in this tab; the cookie expires by itself
    } finally {
      setUser(null)
      loggingOut.current = false
    }
  }, [])

  // The backend sets the session cookies; only the user from the response is kept. The token in the response body
  // (still sent for older clients) is deliberately ignored.
  const login = useCallback(async (email, password) => {
    const { data } = await client.post('/auth/login', { email, password })
    const nextUser = {
      ...data.user,
      must_change_password: Boolean(data.must_change_password ?? data.user.must_change_password),
    }
    setSessionExpired(false)
    setUser(nextUser)
    return nextUser
  }, [])

  // Also the way out of a temporary password: the backend clears must_change_password and returns the user
  const changePassword = useCallback(async (currentPassword, newPassword) => {
    const { data } = await client.post('/auth/change-password', { currentPassword, newPassword })
    setUser(data.user)
    return data.user
  }, [])

  // The API client fires this event on a 401; dropping the user makes ProtectedRoute redirect to /login
  useEffect(() => {
    window.addEventListener(SESSION_EXPIRED_EVENT, clearSession)
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, clearSession)
  }, [clearSession])

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
      // Staff = agents and admins: they see and work on all tickets
      isStaff: user?.role === 'agent' || user?.role === 'admin',
      isAdmin: user?.role === 'admin',
      // Admins and HR manage accounts on the Users page. HR is not staff: for tickets, HR is an employee.
      canManageUsers: user?.role === 'admin' || user?.role === 'hr',
      sessionExpired,
      clearSessionExpired,
      login,
      changePassword,
      logout,
      updateUser,
    }),
    [user, sessionExpired, clearSessionExpired, login, changePassword, logout, updateUser],
  )

  return (
    <AuthContext.Provider value={value}>
      {checking ? (
        <div className="session-check">
          <Spinner label={CHECKING_SESSION_LABEL} />
        </div>
      ) : (
        children
      )}
    </AuthContext.Provider>
  )
}
