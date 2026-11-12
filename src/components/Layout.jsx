// Layout.jsx – the frame around every logged-in page: top bar with logo, navigation and user menu.
// The Dashboard link is only shown to admins; Users and Departments to admins and HR. Your name opens your profile. While the user still has a temporary password,
// the bar shows only the logo and Log out (every page but /set-password is closed to them anyway).
// A one-off message passed in the navigation state ({ flash }) is shown above the page, e.g. "Password changed".
// A page that crashes while rendering is replaced by an error message (RouteErrorBoundary); the bar keeps working.
import {
  Building2,
  Check,
  KeyRound,
  LayoutDashboard,
  LogOut,
  ScrollText,
  Settings as SettingsIcon,
  Ticket,
  TicketPlus,
  Users,
} from 'lucide-react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { useAuth } from '../context/auth'
import RouteErrorBoundary from '../errors/RouteErrorBoundary'
import { ROLE_LABELS } from '../utils/format'
import { useCompanyName } from '../settings/companyName'
import Logo from './Logo'
import { Avatar } from './Ui'

// Used as a layout route (the page comes from <Outlet />) or around `children` (the "Page not found" page)
export default function Layout({ children }) {
  const companyName = useCompanyName()
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
        ...(canManageUsers
          ? [
              { to: '/admin/users', label: 'Users', icon: Users },
              { to: '/admin/departments', label: 'Departments', icon: Building2 },
            ]
          : []),
        ...(isAdmin ? [{ to: '/admin/audit', label: 'Audit log', icon: ScrollText }] : []),
        ...(isAdmin ? [{ to: '/admin/settings', label: 'Settings', icon: SettingsIcon }] : []),
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

  async function handleLogout() {
    await logout() // never fails: the user is forgotten here even if the request does
    navigate('/login', { replace: true })
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar__inner">
          <Link to="/tickets" className="topbar__brand" aria-label={`${companyName} home`}>
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
              <Link
                to="/profile"
                className="topbar__profile"
                title="My profile"
                aria-label={`My profile (${user.name})`}
              >
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
        <RouteErrorBoundary>{children ?? <Outlet />}</RouteErrorBoundary>
      </main>
    </div>
  )
}
