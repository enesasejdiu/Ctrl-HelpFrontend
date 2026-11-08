// factories.js – test data builders shaped like the backend's JSON. Pass overrides for the fields a test cares about.

let nextId = 1000

export function buildUser(overrides = {}) {
  const role = overrides.role ?? 'employee'
  return {
    id: nextId++,
    name: 'Liridon Gashi',
    email: `${role}@ticketflow.local`,
    role,
    department: 'Finance',
    is_active: 1,
    ...overrides,
  }
}

// Same categories and priorities as the backend seed
export const CATEGORIES = [
  { id: 1, name: 'Hardware', description: 'Laptops, desktops, monitors, printers and other devices' },
  { id: 2, name: 'Software', description: 'Installing, updating or fixing applications' },
  { id: 3, name: 'Network', description: 'Wi-Fi, cabling, internet and network outages' },
  { id: 4, name: 'Access', description: 'Accounts, passwords, VPN and permissions' },
  { id: 5, name: 'Email', description: 'Mailboxes, Outlook, calendars and suspicious emails' },
  { id: 6, name: 'Other', description: 'Anything that does not fit another category' },
]

export const PRIORITIES = [
  { id: 1, name: 'Low', level: 1, target_hours: 120 },
  { id: 2, name: 'Medium', level: 2, target_hours: 72 },
  { id: 3, name: 'High', level: 3, target_hours: 24 },
  { id: 4, name: 'Critical', level: 4, target_hours: 4 },
]

export function buildMeta(overrides = {}) {
  return { categories: CATEGORIES, priorities: PRIORITIES, ...overrides }
}

// A list-row ticket as returned by GET /tickets. Pass `category`/`priority` by name to fill both id and name.
export function buildTicket({ category = 'Hardware', priority = 'Medium', ...overrides } = {}) {
  const cat = CATEGORIES.find((c) => c.name === category)
  const prio = PRIORITIES.find((p) => p.name === priority)
  return {
    id: nextId++,
    title: 'Laptop does not turn on',
    description: 'Pressed the power button, nothing happens.',
    status: 'open',
    category_id: cat.id,
    category_name: cat.name,
    priority_id: prio.id,
    priority_name: prio.name,
    requester_id: 4,
    requester_name: 'Liridon Gashi',
    assignee_id: null,
    assignee_name: null,
    is_overdue: false,
    created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    ...overrides,
  }
}
