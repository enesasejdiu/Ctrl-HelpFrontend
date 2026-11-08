// Layout.jsx – the frame around every logged-in page: top bar with logo, navigation and user menu.
// The Dashboard link is only shown to admins; Users to admins and HR. Your name opens your profile. While the user still has a temporary password,
// the bar shows only the logo and Log out (every page but /set-password is closed to them anyway).
// A one-off message passed in the navigation state ({ flash }) is shown above the page, e.g. "Password changed".
import { Check, KeyRound, LayoutDashboard, LogOut, Ticket, TicketPlus, Users } from 'lucide-react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/auth'
import { ROLE_LABELS } from '../utils/format'
import Logo from './Logo'
import { Avatar } from './Ui'

export default function Layout() {
  const { user, isAdmin, canManageUsers, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const mustSetPassword = Boolean(user.must_change_password)

  const links = mustSetPassword
    ? []
    : [
        // `end` keeps "Tickets" from staying active on /tickets/new
        { to: '/tickets', label: 'Tickets', icon: Ticket, end: true },
        { to: '/tickets/new', label: 'New ticket', icon: TicketPlus },
        ...(isAdmin ? [{ to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true }] : []),
        ...(canManageUsers ? [{ to: '/admin/users', label: 'Users', icon: Users }] : []),
      ]

  // Avatar, name and role; a link to /profile, except while the user must first set a password
  const who = (
    <>
      <Avatar name={user.name} />
      <span className="topbar__user-text">
        <span className="topbar__user-name">{user.name}</span>
        <span className={`role-tag role-tag--${user.role}`}>{ROLE_LABELS[user.role] || user.role}</span>
      </span>
    </>
  )

  function handleLogout() {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar__inner">
          <Link to="/tickets" className="topbar__brand" aria-label="TicketFlow home">
            <Logo />
          </Link>

          <nav className="topbar__nav" aria-label="Main">
            {links.map(({ to, label, icon: Icon, end }) => (
              <NavLink key={to} to={to} end={end} className="nav-link">
                <Icon size={16} aria-hidden="true" />
                {label}
              </NavLink>
            ))}
          </nav>

          <div className="topbar__user">
            {mustSetPassword ? (
              <span className="topbar__profile">{who}</span>
            ) : (
              <Link to="/profile" className="topbar__profile" title="My profile" aria-label={`My profile (${user.name})`}>
                {who}
              </Link>
            )}
            {!mustSetPassword && (
              <Link to="/change-password" className="icon-button" title="Change password" aria-label="Change password">
                <KeyRound size={17} aria-hidden="true" />
              </Link>
            )}
            <button type="button" className="icon-button" onClick={handleLogout} title="Log out" aria-label="Log out">
              <LogOut size={17} aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>

      <main className="page">
        {location.state?.flash && (
          <div className="notice notice--success page-notice" role="status">
            <Check size={18} aria-hidden="true" />
            <p>{location.state.flash}</p>
          </div>
        )}
        <Outlet />
      </main>
    </div>
  )
}
