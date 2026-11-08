// AuthContext.jsx – holds the logged-in user for the whole app.
// The token and user are saved in localStorage so a page reload keeps you logged in.
import { useCallback, useEffect, useMemo, useState } from 'react'
import client, { SESSION_EXPIRED_EVENT, TOKEN_KEY, USER_KEY } from '../api/client'
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

  const saveSession = useCallback(({ token, user: nextUser }) => {
    localStorage.setItem(TOKEN_KEY, token)
    localStorage.setItem(USER_KEY, JSON.stringify(nextUser))
    setUser(nextUser)
  }, [])

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

  const register = useCallback(
    async (fields) => {
      const { data } = await client.post('/auth/register', fields)
      saveSession(data)
      return data.user
    },
    [saveSession],
  )

  // The API client fires this event on a 401; dropping the user makes ProtectedRoute redirect to /login
  useEffect(() => {
    window.addEventListener(SESSION_EXPIRED_EVENT, logout)
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, logout)
  }, [logout])

  // Refresh the saved profile once on load, so a role changed by an admin shows up without logging in again
  useEffect(() => {
    if (!localStorage.getItem(TOKEN_KEY)) return
    client
      .get('/auth/me')
      .then(({ data }) => {
        localStorage.setItem(USER_KEY, JSON.stringify(data))
        setUser(data)
      })
      .catch(() => {}) // a 401 is already handled by the client; network errors keep the saved user
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
      login,
      register,
      logout,
    }),
    [user, login, register, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
