// Ui.jsx – small building blocks reused on every page: avatar, spinner, alert, empty state, page header.
import { CircleAlert, LoaderCircle } from 'lucide-react'
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

export function Alert({ children, tone = 'error' }) {
  return (
    <div className={`alert alert--${tone}`} role="alert">
      <CircleAlert size={18} aria-hidden="true" />
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
