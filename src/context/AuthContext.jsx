// AuthContext.jsx – holds the logged-in user for the whole app.
// The token and user are saved in localStorage so a page reload keeps you logged in.
import { useCallback, useEffect, useMemo, useState } from 'react'
import client, { PASSWORD_CHANGE_REQUIRED_EVENT, SESSION_EXPIRED_EVENT, TOKEN_KEY, USER_KEY } from '../api/client'
import { AuthContext } from './auth'

// Reads the saved user; a corrupted value counts as logged out
function loadUser() {
  try {
    const saved = localStorage.getItem(USER_KEY)
    return saved && localStorage.getItem(TOKEN_KEY) ? JSON.parse(saved) : null
  } catch {
    return null
  }
}

export function AuthProvider({ children }) {
  // Passing the function means localStorage is only read once, on the first render
  const [user, setUser] = useState(loadUser)

  // Saves a new copy of the logged-in user (the token stays the same)
  const saveUser = useCallback((nextUser) => {
    localStorage.setItem(USER_KEY, JSON.stringify(nextUser))
    setUser(nextUser)
  }, [])

  const saveSession = useCallback(
    ({ token, user: nextUser }) => {
      localStorage.setItem(TOKEN_KEY, token)
      saveUser(nextUser)
    },
    [saveUser],
  )

  // Logging out only forgets the token in this browser; the token itself expires on the backend
  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
    setUser(null)
  }, [])

  const login = useCallback(
    async (email, password) => {
      const { data } = await client.post('/auth/login', { email, password })
      saveSession(data)
      return data.user
    },
    [saveSession],
  )

  // Also the way out of a temporary password: the backend clears must_change_password and returns the user
  const changePassword = useCallback(
    async (currentPassword, newPassword) => {
      const { data } = await client.post('/auth/change-password', { currentPassword, newPassword })
      saveUser(data.user)
      return data.user
    },
    [saveUser],
  )

  // The API client fires this event on a 401; dropping the user makes ProtectedRoute redirect to /login
  useEffect(() => {
    window.addEventListener(SESSION_EXPIRED_EVENT, logout)
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, logout)
  }, [logout])

  // The password was reset while this user was logged in: flag them so ProtectedRoute sends them to /change-password
  useEffect(() => {
    function requirePasswordChange() {
      const current = loadUser()
      if (current && !current.must_change_password) saveUser({ ...current, must_change_password: true })
    }
    window.addEventListener(PASSWORD_CHANGE_REQUIRED_EVENT, requirePasswordChange)
    return () => window.removeEventListener(PASSWORD_CHANGE_REQUIRED_EVENT, requirePasswordChange)
  }, [saveUser])

  // Refresh the saved profile once on load, so a role changed by an admin shows up without logging in again
  useEffect(() => {
    if (!localStorage.getItem(TOKEN_KEY)) return
    client
      .get('/auth/me')
      .then(({ data }) => saveUser(data))
      .catch(() => {}) // a 401 is already handled by the client; network errors keep the saved user
  }, [saveUser])

  // useMemo keeps the same object between renders, so components using useAuth() only re-render when it changes
  const value = useMemo(
    () => ({
      user,
      // Staff = agents and admins: they see and work on all tickets. HR works tickets like an employee.
      isStaff: user?.role === 'agent' || user?.role === 'admin',
      isAdmin: user?.role === 'admin',
      // Admins and HR manage accounts; HR only employee accounts (the backend enforces this)
      canManageUsers: user?.role === 'admin' || user?.role === 'hr',
      login,
      changePassword,
      logout,
    }),
    [user, login, changePassword, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
