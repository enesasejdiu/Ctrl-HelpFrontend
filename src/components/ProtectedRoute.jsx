// ProtectedRoute.jsx – guards pages that need a login.
// Logged out → /login (remembering where you wanted to go). With `roles`, other roles go back to /tickets.
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/auth'

export default function ProtectedRoute({ roles, children }) {
  const { user } = useAuth()
  const location = useLocation()

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }
  if (roles && !roles.includes(user.role)) {
    return <Navigate to="/tickets" replace />
  }
  // Works both as a wrapper (<ProtectedRoute><Page /></ProtectedRoute>) and as a layout route
  return children ?? <Outlet />
}
