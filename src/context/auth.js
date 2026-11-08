// auth.js – the auth context object and the useAuth() hook.
// Kept apart from AuthContext.jsx so that file only exports a component (needed for fast refresh).
import { createContext, useContext } from 'react'

export const AuthContext = createContext(null)

// Returns { user, isStaff, isAdmin, canManageUsers, login, logout }; must be used inside <AuthProvider>
export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>')
  return value
}
