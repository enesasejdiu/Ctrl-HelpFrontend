// format.js – display helpers shared across pages: status/role labels, dates and initials.
// Kept out of Badges.jsx so that component file only exports components.

// Backend status values in workflow order, with their display labels
export const STATUS_LABELS = {
  open: 'Open',
  assigned: 'Assigned',
  in_progress: 'In Progress',
  waiting_for_user: 'Waiting for User',
  resolved: 'Resolved',
  closed: 'Closed',
  reopened: 'Reopened',
}

export const STATUSES = Object.keys(STATUS_LABELS)

export const ROLE_LABELS = {
  employee: 'Employee',
  agent: 'IT Staff',
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

// "Arben Krasniqi" → "AK"
export function initials(name = '') {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('')
}
