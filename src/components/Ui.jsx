// Ui.jsx – small building blocks reused on every page: avatar, spinner, alert, empty state, page header.
import { CircleAlert, Info, LoaderCircle, TriangleAlert } from 'lucide-react'
import { initials } from '../utils/format'

export function Avatar({ name, size = 'md' }) {
  return (
    <span className={`avatar avatar--${size}`} aria-hidden="true">
      {initials(name)}
    </span>
  )
}

export function Spinner({ label = 'Loading…' }) {
  return (
    <div className="spinner" role="status">
      <LoaderCircle className="spin" size={20} aria-hidden="true" />
      <span>{label}</span>
    </div>
  )
}

// tone: error (default) and warning interrupt the screen reader (role="alert"); info waits its turn (role="status").
// Each tone has its own icon, so the meaning doesn't rest on color alone.
const ALERT_TONES = {
  error: { icon: CircleAlert, role: 'alert' },
  warning: { icon: TriangleAlert, role: 'alert' },
  info: { icon: Info, role: 'status' },
}

export function Alert({ tone = 'error', children }) {
  const { icon: Icon, role } = ALERT_TONES[tone]
  return (
    <div className={`alert alert--${tone}`} role={role}>
      <Icon size={18} aria-hidden="true" />
      <div>{children}</div>
    </div>
  )
}

// Centered message for "nothing here" screens; `icon` is a lucide icon component
export function EmptyState({ icon: Icon, title, children, action }) {
  return (
    <div className="empty-state">
      {Icon && (
        <div className="empty-state__icon">
          <Icon size={22} aria-hidden="true" />
        </div>
      )}
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  )
}

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="page-header__subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="page-header__actions">{actions}</div>}
    </div>
  )
}
