// Layout.jsx – the frame around every logged-in page: top bar with logo, navigation and user menu.
// The Dashboard link is only shown to admins; Users to admins and HR.
import { LayoutDashboard, LogOut, Ticket, TicketPlus, Users } from 'lucide-react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/auth'
import { ROLE_LABELS } from '../utils/format'
import Logo from './Logo'
import { Avatar } from './Ui'

export default function Layout() {
  const { user, isAdmin, canManageUsers, logout } = useAuth()
  const navigate = useNavigate()

  const links = [
    // `end` keeps "Tickets" from staying active on /tickets/new
    { to: '/tickets', label: 'Tickets', icon: Ticket, end: true },
    { to: '/tickets/new', label: 'New ticket', icon: TicketPlus },
    ...(isAdmin ? [{ to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true }] : []),
    ...(canManageUsers ? [{ to: '/admin/users', label: 'Users', icon: Users }] : []),
  ]

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
            <Avatar name={user.name} />
            <div className="topbar__user-text">
              <span className="topbar__user-name">{user.name}</span>
              <span className={`role-tag role-tag--${user.role}`}>{ROLE_LABELS[user.role] || user.role}</span>
            </div>
            <button type="button" className="icon-button" onClick={handleLogout} title="Log out" aria-label="Log out">
              <LogOut size={17} aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>

      <main className="page">
        <Outlet />
      </main>
    </div>
  )
}
