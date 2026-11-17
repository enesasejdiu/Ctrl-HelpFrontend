// audit.js – display helpers for the audit log page: a readable label for each action, a short summary of an entry's
// details, and which actions are warnings. The actions and their details are defined by the backend
// (GET /api/audit, see "Audit log" in the backend README).
import { formatBytes } from './attachments'
import { ROLE_LABELS } from './format'

const ACTION_LABELS = {
  login_success: 'Signed in',
  login_failure: 'Login failed',
  account_locked: 'Account locked',
  logout: 'Signed out',
  logout_all: 'Signed out everywhere',
  password_changed: 'Password changed',
  password_reset: 'Password reset',
  user_created: 'User created',
  user_updated: 'User edited',
  role_changed: 'Role changed',
  user_activated: 'User activated',
  user_deactivated: 'User deactivated',
  attachment_uploaded: 'File attached',
  attachment_deleted: 'Attachment deleted',
  'kb.article_created': 'Article written',
  'kb.article_updated': 'Article edited',
  'kb.article_published': 'Article published',
  'kb.article_unpublished': 'Article unpublished',
  'kb.article_deleted': 'Article deleted',
  'kb.category_created': 'Help category added',
  'kb.category_updated': 'Help category edited',
  'kb.category_deleted': 'Help category deleted',
  'canned.shared_created': 'Shared reply added',
  'canned.shared_updated': 'Shared reply edited',
  'canned.shared_deleted': 'Shared reply deleted',
}

// The knowledge-base article fields an edit can change, as people say them
const ARTICLE_FIELD_LABELS = {
  title: 'title',
  slug: 'address',
  summary: 'summary',
  body: 'text',
  category_id: 'category',
}

// Shown in the warning colour: someone failed to get in
const WARNING_ACTIONS = ['login_failure', 'account_locked']

const FAILURE_REASONS = {
  unknown_email: 'Unknown email',
  wrong_password: 'Wrong password',
  locked: 'Account was locked',
  deactivated: 'Account is deactivated',
}

// The user fields an edit can change, as people say them
const FIELD_LABELS = { name: 'name', email: 'email', department_id: 'department', job_title: 'job title' }

// A label for any action; an action this version doesn't know yet shows its name
export function actionLabel(action) {
  return ACTION_LABELS[action] || action
}

export function isWarningAction(action) {
  return WARNING_ACTIONS.includes(action)
}

const roleLabel = (role) => ROLE_LABELS[role] || role
const count = (n, one, other) => `${n} ${n === 1 ? one : other}`

// One short line describing an entry's details, e.g. "Employee → IT Staff", "Fields: name, email", "Wrong password".
// '' when there is nothing to add.
export function auditSummary({ action, details }) {
  const d = details || {}
  switch (action) {
    case 'login_success':
      return d.email || ''
    case 'login_failure': {
      const reason = FAILURE_REASONS[d.reason] || d.reason || 'Login failed'
      // The target column shows whose account it was; an unknown email has no account, so name the email
      return d.reason === 'unknown_email' && d.email ? `${reason}: ${d.email}` : reason
    }
    case 'account_locked':
      return d.minutes ? `Locked for ${count(d.minutes, 'minute', 'minutes')}` : 'Locked'
    case 'logout_all':
    case 'password_reset':
      return typeof d.sessions_ended === 'number' ? count(d.sessions_ended, 'session ended', 'sessions ended') : ''
    case 'password_changed':
      if (typeof d.other_sessions_ended !== 'number') return ''
      return d.other_sessions_ended === 0
        ? 'No other sessions'
        : count(d.other_sessions_ended, 'other session ended', 'other sessions ended')
    case 'user_created':
      return [d.role && roleLabel(d.role), d.email].filter(Boolean).join(' · ')
    case 'user_updated':
      return Array.isArray(d.fields) && d.fields.length > 0
        ? `Fields: ${d.fields.map((field) => FIELD_LABELS[field] || field).join(', ')}`
        : ''
    case 'role_changed':
      return d.from && d.to ? `${roleLabel(d.from)} → ${roleLabel(d.to)}` : ''
    case 'attachment_uploaded':
    case 'attachment_deleted':
      // "invoice.pdf (12.5 KB) · ticket #42"
      return [
        d.file_name &&
          (typeof d.size_bytes === 'number' ? `${d.file_name} (${formatBytes(d.size_bytes)})` : d.file_name),
        d.ticket_id && `ticket #${d.ticket_id}`,
      ]
        .filter(Boolean)
        .join(' · ')
    case 'kb.article_created':
    case 'kb.article_published':
    case 'kb.article_unpublished':
    case 'kb.article_deleted':
      return d.title || ''
    case 'kb.article_updated':
      // "VPN setup · title, text"
      return [
        d.title,
        Array.isArray(d.fields) && d.fields.map((field) => ARTICLE_FIELD_LABELS[field] || field).join(', '),
      ]
        .filter(Boolean)
        .join(' · ')
    case 'kb.category_created':
    case 'kb.category_updated':
    case 'kb.category_deleted':
      return d.name || ''
    case 'canned.shared_created':
    case 'canned.shared_deleted':
      return d.title || ''
    case 'canned.shared_updated':
      // "Password reset · title, text"
      return [
        d.title,
        Array.isArray(d.fields) && d.fields.map((field) => (field === 'body' ? 'text' : field)).join(', '),
      ]
        .filter(Boolean)
        .join(' · ')
    default:
      return ''
  }
}
