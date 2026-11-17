// placeholders.js – the {{…}} placeholders in canned responses, filled in from the open ticket when a response is
// inserted. The result is plain text (shown escaped, like every comment). A placeholder this list doesn't know stays as
// written, and the preview marks it with a warning.

// Each placeholder: its key (written as {{key}}) and the i18n key of what it becomes ("The requester's name")
export const PLACEHOLDERS = [
  { key: 'requester.name', label: 'canned.placeholder.requesterName' },
  { key: 'requester.first_name', label: 'canned.placeholder.requesterFirstName' },
  { key: 'agent.name', label: 'canned.placeholder.agentName' },
  { key: 'ticket.number', label: 'canned.placeholder.ticketNumber' },
  { key: 'ticket.title', label: 'canned.placeholder.ticketTitle' },
  { key: 'company.name', label: 'canned.placeholder.companyName' },
]

const PATTERN = /\{\{\s*([\w.]+)\s*\}\}/g

// The values for one ticket: { 'requester.name': 'Liridon Gashi', … }
export function placeholderValues({ ticket, user, companyName }) {
  const requester = (ticket?.requester_name ?? '').trim()
  return {
    'requester.name': requester,
    'requester.first_name': requester.split(/\s+/)[0] ?? '',
    'agent.name': user?.name ?? '',
    'ticket.number': ticket ? String(ticket.id) : '',
    'ticket.title': ticket?.title ?? '',
    'company.name': companyName ?? '',
  }
}

// The text cut into parts: { text, kind: 'text' | 'filled' | 'unknown' }. A placeholder without a value (unknown
// key, or an empty value) stays as written and is 'unknown'.
export function placeholderParts(body, values) {
  const text = String(body ?? '')
  const parts = []
  let last = 0
  for (const found of text.matchAll(PATTERN)) {
    if (found.index > last) parts.push({ text: text.slice(last, found.index), kind: 'text' })
    const value = values[found[1]]
    parts.push(value ? { text: value, kind: 'filled' } : { text: found[0], kind: 'unknown' })
    last = found.index + found[0].length
  }
  if (last < text.length) parts.push({ text: text.slice(last), kind: 'text' })
  return parts
}

// → { text, unknown: ['{{who.knows}}', …] }: the filled-in text, and the placeholders left as written
export function fillPlaceholders(body, values) {
  const parts = placeholderParts(body, values)
  return {
    text: parts.map((part) => part.text).join(''),
    unknown: [...new Set(parts.filter((part) => part.kind === 'unknown').map((part) => part.text))],
  }
}
