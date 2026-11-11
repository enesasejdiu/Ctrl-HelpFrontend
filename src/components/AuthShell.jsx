// AuthShell.jsx – split-screen frame for the login page:
// a brand panel on the left (hidden on small screens) and the form card on the right.
import { ChartColumn, Clock, ShieldCheck } from 'lucide-react'
import Logo from './Logo'

const FEATURES = [
  {
    icon: Clock,
    title: 'Response targets built in',
    text: 'Every ticket tracks its priority target, from 4h for Critical to 5 days for Low.',
  },
  {
    icon: ShieldCheck,
    title: 'Private by default',
    text: 'Employees only see their own tickets; internal notes stay with IT.',
  },
  {
    icon: ChartColumn,
    title: 'Know how the team is doing',
    text: 'Live dashboards for volume, resolution time and agent workload.',
  },
]

const YEAR = new Date().getFullYear()

export default function AuthShell({ title, subtitle, children, footer }) {
  return (
    <div className="auth">
      <aside className="auth__brand">
        <Logo inverted />
        <div className="auth__pitch">
          <h2>IT support that keeps moving.</h2>
          <p>
            Report a problem in seconds, follow it to the fix, and let the IT team focus on solving instead of chasing.
          </p>
          <ul className="auth__features">
            {FEATURES.map(({ icon: Icon, title: featureTitle, text }) => (
              <li key={featureTitle}>
                <span className="auth__feature-icon">
                  <Icon size={18} aria-hidden="true" />
                </span>
                <div>
                  <strong>{featureTitle}</strong>
                  <span>{text}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <p className="auth__legal">© {YEAR} TicketFlow · Internal IT helpdesk</p>
      </aside>

      <section className="auth__panel">
        <div className="auth__card">
          <div className="auth__mobile-logo">
            <Logo />
          </div>
          <h1>{title}</h1>
          {subtitle && <p className="auth__subtitle">{subtitle}</p>}
          {children}
          {footer && <p className="auth__footer">{footer}</p>}
        </div>
      </section>
    </div>
  )
}
