// audit.test.js – the audit log's labels and one-line summaries, for every action the backend records.
import { actionLabel, auditSummary, isWarningAction } from './audit'

const ACTIONS = [
  ['login_success', 'Signed in'],
  ['login_failure', 'Login failed'],
  ['account_locked', 'Account locked'],
  ['logout', 'Signed out'],
  ['logout_all', 'Signed out everywhere'],
  ['password_changed', 'Password changed'],
  ['password_reset', 'Password reset'],
  ['user_created', 'User created'],
  ['user_updated', 'User edited'],
  ['role_changed', 'Role changed'],
  ['user_activated', 'User activated'],
  ['user_deactivated', 'User deactivated'],
  ['attachment_uploaded', 'File attached'],
  ['attachment_deleted', 'Attachment deleted'],
  ['kb.article_created', 'Article written'],
  ['kb.article_updated', 'Article edited'],
  ['kb.article_published', 'Article published'],
  ['kb.article_unpublished', 'Article unpublished'],
  ['kb.article_deleted', 'Article deleted'],
  ['kb.category_created', 'Help category added'],
  ['kb.category_updated', 'Help category edited'],
  ['kb.category_deleted', 'Help category deleted'],
  ['canned.shared_created', 'Shared reply added'],
  ['canned.shared_updated', 'Shared reply edited'],
  ['canned.shared_deleted', 'Shared reply deleted'],
]

describe('actionLabel', () => {
  it.each(ACTIONS)('%s → "%s"', (action, label) => {
    expect(actionLabel(action)).toBe(label)
  })

  it('shows the name of an action it does not know yet', () => {
    expect(actionLabel('something_new')).toBe('something_new')
  })
})

describe('isWarningAction', () => {
  it('failed logins and lockouts are warnings, nothing else', () => {
    expect(ACTIONS.map(([action]) => action).filter(isWarningAction)).toEqual(['login_failure', 'account_locked'])
  })
})

describe('auditSummary', () => {
  it.each([
    ['login_success', { email: 'a@x.com' }, 'a@x.com'],
    ['login_failure', { email: 'a@x.com', reason: 'wrong_password' }, 'Wrong password'],
    ['login_failure', { email: 'nobody@x.com', reason: 'unknown_email' }, 'Unknown email: nobody@x.com'],
    ['login_failure', { email: 'a@x.com', reason: 'locked' }, 'Account was locked'],
    ['login_failure', { email: 'a@x.com', reason: 'deactivated' }, 'Account is deactivated'],
    ['account_locked', { email: 'a@x.com', minutes: 15 }, 'Locked for 15 minutes'],
    ['account_locked', { email: 'a@x.com', minutes: 1 }, 'Locked for 1 minute'],
    ['logout', null, ''],
    ['logout_all', { sessions_ended: 3 }, '3 sessions ended'],
    ['logout_all', { sessions_ended: 1 }, '1 session ended'],
    ['password_changed', { other_sessions_ended: 2 }, '2 other sessions ended'],
    ['password_changed', { other_sessions_ended: 0 }, 'No other sessions'],
    ['password_reset', { sessions_ended: 0 }, '0 sessions ended'],
    ['user_created', { email: 'new@x.com', role: 'agent', department_id: 2 }, 'IT Staff · new@x.com'],
    ['user_updated', { fields: ['name', 'email'] }, 'Fields: name, email'],
    ['user_updated', { fields: ['department_id', 'job_title'] }, 'Fields: department, job title'],
    ['role_changed', { from: 'employee', to: 'agent' }, 'Employee → IT Staff'],
    ['user_activated', null, ''],
    ['user_deactivated', null, ''],
    [
      'attachment_uploaded',
      { ticket_id: 42, file_name: 'invoice.pdf', mime_type: 'application/pdf', size_bytes: 12800 },
      'invoice.pdf (12.5 KB) · ticket #42',
    ],
    [
      'attachment_deleted',
      { ticket_id: 7, file_name: 'notes.txt', size_bytes: 900 },
      'notes.txt (900 bytes) · ticket #7',
    ],
    ['kb.article_created', { article_id: 3, slug: 'vpn-setup', title: 'VPN setup' }, 'VPN setup'],
    ['kb.article_published', { article_id: 3, slug: 'vpn-setup', title: 'VPN setup' }, 'VPN setup'],
    ['kb.article_unpublished', { article_id: 3, slug: 'vpn-setup', title: 'VPN setup' }, 'VPN setup'],
    ['kb.article_deleted', { article_id: 3, slug: 'vpn-setup', title: 'VPN setup' }, 'VPN setup'],
    [
      'kb.article_updated',
      { article_id: 3, title: 'VPN setup', fields: ['title', 'body', 'slug', 'category_id', 'summary'] },
      'VPN setup · title, text, address, category, summary',
    ],
    ['kb.article_updated', { article_id: 3, title: 'VPN setup', fields: [] }, 'VPN setup'],
    ['kb.category_created', { category_id: 2, name: 'Network' }, 'Network'],
    ['kb.category_updated', { category_id: 2, name: 'Network', fields: ['name'] }, 'Network'],
    ['kb.category_deleted', { category_id: 2, name: 'Network' }, 'Network'],
    ['canned.shared_created', { canned_response_id: 4, title: 'Password reset' }, 'Password reset'],
    [
      'canned.shared_updated',
      { canned_response_id: 4, title: 'Password reset', fields: ['title', 'body'] },
      'Password reset · title, text',
    ],
    ['canned.shared_deleted', { canned_response_id: 4, title: 'Password reset' }, 'Password reset'],
  ])('%s %j → "%s"', (action, details, summary) => {
    expect(auditSummary({ action, details })).toBe(summary)
  })

  it('never fails on missing or unexpected details', () => {
    for (const [action] of ACTIONS) {
      expect(typeof auditSummary({ action, details: null })).toBe('string')
      expect(typeof auditSummary({ action, details: {} })).toBe('string')
    }
    expect(auditSummary({ action: 'login_failure', details: { reason: 'new_reason' } })).toBe('new_reason')
    expect(auditSummary({ action: 'something_new', details: { x: 1 } })).toBe('')
  })
})
