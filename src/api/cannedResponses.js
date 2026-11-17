// cannedResponses.js – prepared replies for staff (backend README, "Canned responses"). Each response is
// { id, title, body, shared, owner_id, usage_count, last_used_at, created_at, updated_at, updated_by, can_edit }.
// A check that fails is 422 with { message, errors: [{ field, message }] }; a title in use is 409 TITLE_TAKEN.
import client from './client'

export const CANNED_TITLE_MAX = 100
export const CANNED_BODY_MAX = 5000

// params: { q, scope: 'all' | 'shared' | 'mine' } → at most 50, most used first; empty values are left out
export function listCannedResponses(params = {}, config = {}) {
  const query = Object.fromEntries(Object.entries(params).filter(([, value]) => value !== undefined && value !== ''))
  return client.get('/canned-responses', { ...config, params: query }).then((res) => res.data)
}

// fields: { title, body, shared } (shared: admins only)
export const createCannedResponse = (fields) => client.post('/canned-responses', fields).then((res) => res.data)
// fields: { title?, body? }
export const updateCannedResponse = (id, fields) =>
  client.patch(`/canned-responses/${id}`, fields).then((res) => res.data)
export const deleteCannedResponse = (id) => client.delete(`/canned-responses/${id}`)

// Counts one use, after the text was inserted. Nothing waits for it, and a failure changes nothing for the user.
export function markCannedResponseUsed(id) {
  client.post(`/canned-responses/${id}/used`).catch(() => {})
}
