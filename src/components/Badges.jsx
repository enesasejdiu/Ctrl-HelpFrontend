// Badges.jsx – small colored labels for ticket status, priority and overdue state.
// Colors live in index.css (.badge--status-*, .badge--priority-*), keyed by the backend values.
import { Clock } from 'lucide-react'
import { statusLabel } from '../utils/format'

// Unknown statuses show their raw value; a missing one renders nothing rather than an empty pill
export function StatusBadge({ status }) {
  if (!status) return null
  return (
    <span className={`badge badge--status-${status}`}>
      <span className="badge__dot" aria-hidden="true" />
      {statusLabel(status)}
    </span>
  )
}

// `priority` is the display name from the API ("Low", "Medium", "High", "Critical")
export function PriorityBadge({ priority }) {
  if (!priority) return null
  const level = String(priority).toLowerCase()
  return (
    <span className={`badge badge--priority badge--priority-${level}`}>
      <span className="priority-bars" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
      </span>
      {priority}
    </span>
  )
}

export function OverdueBadge() {
  return (
    <span className="badge badge--overdue" title="Older than the target time for its priority">
      <Clock size={12} strokeWidth={2.5} aria-hidden="true" />
      Overdue
    </span>
  )
}
