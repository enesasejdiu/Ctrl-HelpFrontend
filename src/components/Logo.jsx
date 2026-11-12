// Logo.jsx – the TicketFlow mark (a ticket with a flow arrow) plus the wordmark: the company's name from the Settings
// page (useCompanyName), or "TicketFlow" when none is set. Pass `name` to show a fixed text instead.
import { useCompanyName } from '../settings/companyName'

export default function Logo({ inverted = false, name }) {
  const companyName = useCompanyName()
  return (
    <span className={`logo${inverted ? ' logo--inverted' : ''}`}>
      <svg className="logo__mark" viewBox="0 0 32 32" aria-hidden="true">
        <rect width="32" height="32" rx="8" fill="currentColor" />
        <path
          d="M8 11.5a1.5 1.5 0 0 1 1.5-1.5h13a1.5 1.5 0 0 1 1.5 1.5v2a2.5 2.5 0 0 0 0 5v2a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 8 20.5v-2a2.5 2.5 0 0 0 0-5z"
          fill="#fff"
        />
        <path
          d="M13 16h6m-2-2 2 2-2 2"
          stroke="var(--logo-arrow)"
          strokeWidth="1.8"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="logo__text">{name ?? companyName}</span>
    </span>
  )
}
