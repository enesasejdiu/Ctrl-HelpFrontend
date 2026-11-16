// format.js – display helpers shared across pages: status/role labels, dates and initials.
// Kept out of Badges.jsx so that component file only exports components.

// Backend status values in workflow order, with their display labels
const STATUS_LABELS = {
  open: 'Open',
  assigned: 'Assigned',
  in_progress: 'In Progress',
  waiting_for_user: 'Waiting for User',
  resolved: 'Resolved',
  closed: 'Closed',
  reopened: 'Reopened',
}

export const STATUSES = Object.keys(STATUS_LABELS)

// In the order they appear in role dropdowns
export const ROLE_LABELS = {
  employee: 'Employee',
  agent: 'IT Staff',
  hr: 'HR',
  admin: 'Admin',
}

export function statusLabel(status) {
  return STATUS_LABELS[status] || status
}

// "3 Nov 2026, 14:05"
export function formatDate(value) {
  if (!value) return '—'
  return new Date(value).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// "just now", "5m ago", "3h ago", "2d ago"; falls back to the date after a week
export function timeAgo(value) {
  if (!value) return '—'
  const minutes = Math.floor((Date.now() - new Date(value).getTime()) / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

// Durations given in hours: 0.5 → "30 min", 5.2 → "5.2 h", 72 → "3 d"
export function formatHours(hours) {
  if (hours === null || hours === undefined) return '—'
  if (hours < 1) return `${Math.round(hours * 60)} min`
  if (hours < 48) return `${Number(hours.toFixed(1))} h`
  return `${Number((hours / 24).toFixed(1))} d`
}

// Target time of a priority: "4 hours", "3 days"
export function targetLabel(hours) {
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'}`
  const days = hours / 24
  return `${days} ${days === 1 ? 'day' : 'days'}`
}

// "Arben Krasniqi" → "AK"
export function initials(name = '') {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('')
}

// A target time in hours as the Settings page shows it: "4 h", "24 h (1 day)", "36 h (1.5 days)", "72 h (3 days)"
export function hoursLabel(hours) {
  if (hours < 24) return `${hours} h`
  const days = Math.round((hours / 24) * 10) / 10
  return `${hours} h (${days} ${days === 1 ? 'day' : 'days'})`
}
