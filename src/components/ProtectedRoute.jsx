// ProtectedRoute.jsx – guards pages that need a login.
// Logged out → /login (remembering where you wanted to go, and with ?reason=session_expired when the session ran out
// mid-way, so the login page can say so; after "Log out everywhere" its notice goes along in the router state).
// With `roles`, other roles go back to /tickets.
// A user with a temporary password can only open /set-password until they have chosen their own.
import { Navigate, Outlet, useLocation } from 'react-router'
import { useAuth } from '../context/auth'

export default function ProtectedRoute({ roles, children }) {
  const { user, sessionExpired, signOutNotice } = useAuth()
  const location = useLocation()

  if (!user) {
    return (
      <Navigate
        to={sessionExpired ? '/login?reason=session_expired' : '/login'}
        replace
        state={signOutNotice ? { from: location, notice: signOutNotice } : { from: location }}
      />
    )
  }
  // The backend refuses every other request for this user, so other pages couldn't load anyway
  if (user.must_change_password && location.pathname !== '/set-password') {
    return <Navigate to="/set-password" replace />
  }
  // This only hides pages; the backend checks the role again on every request
  if (roles && !roles.includes(user.role)) {
    return <Navigate to="/tickets" replace />
  }
  // Works both as a wrapper (<ProtectedRoute><Page /></ProtectedRoute>) and as a layout route
  return children ?? <Outlet />
}
