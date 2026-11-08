// ProtectedRoute.jsx – guards pages that need a login.
// Logged out → /login (remembering where you wanted to go). With `roles`, other roles go back to /tickets.
// A user with a temporary password can only open /change-password until they have chosen their own.
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/auth'

export default function ProtectedRoute({ roles, children }) {
  const { user } = useAuth()
  const location = useLocation()

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }
  // The backend refuses every other request for this user, so other pages couldn't load anyway
  if (user.must_change_password && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace state={{ from: location }} />
  }
  // This only hides pages; the backend checks the role again on every request
  if (roles && !roles.includes(user.role)) {
    return <Navigate to="/tickets" replace />
  }
  // Works both as a wrapper (<ProtectedRoute><Page /></ProtectedRoute>) and as a layout route
  return children ?? <Outlet />
}
