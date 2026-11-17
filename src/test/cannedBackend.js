// cannedBackend.js – an in-memory canned-responses API for the tests (MSW), following the backend's rules (README
// "Canned responses"): scope all|shared|mine, q over title and body, most used first then by title, at most 50;
// others' personal responses never listed and 404 to change; shared ones admin-only (403); a title taken in its scope
// → 409 TITLE_TAKEN. mockCanned({ responses }) installs it and returns its state.
import { http, HttpResponse } from 'msw'
import { API, server, session } from './server'

let nextId = 500

// A response owned by `owner` (a user id), or shared when owner is null
export function buildCanned({ owner = 7, ...overrides } = {}) {
  const id = overrides.id ?? nextId++
  return {
    id,
    title: `Response ${id}`,
    body: `Hello {{requester.first_name}}, text ${id}.`,
    owner_id: owner,
    shared: owner === null,
    usage_count: 0,
    last_used_at: null,
    created_at: '2026-11-01T09:00:00.000Z',
    updated_at: '2026-11-10T09:00:00.000Z',
    updated_by: null,
    ...overrides,
  }
}

const me = () => session.user
const isAdmin = () => me()?.role === 'admin'
const visible = (r) => r.owner_id === null || r.owner_id === me()?.id
const canEdit = (r) => (r.owner_id === null ? isAdmin() : r.owner_id === me()?.id)
const out = (r) => ({ ...r, shared: r.owner_id === null, can_edit: canEdit(r) })
const taken = (state, r, title) =>
  state.responses.some(
    (other) => other.id !== r.id && other.owner_id === r.owner_id && other.title.toLowerCase() === title.toLowerCase(),
  )
const titleTaken = () =>
  HttpResponse.json(
    {
      message: 'You already have a response with this title',
      code: 'TITLE_TAKEN',
      errors: [{ field: 'title', message: 'You already have a response with this title' }],
    },
    { status: 409 },
  )

export function mockCanned({ responses = [] } = {}) {
  const state = { responses: structuredClone(responses), listRequests: [], saves: [], deletes: [], used: [] }
  const find = (id) => state.responses.find((r) => r.id === Number(id) && visible(r))

  server.use(
    http.get(`${API}/canned-responses`, ({ request }) => {
      const params = Object.fromEntries(new URL(request.url).searchParams)
      state.listRequests.push(params)
      const scope = params.scope ?? 'all'
      const q = params.q?.toLowerCase()
      const items = state.responses
        .filter(visible)
        .filter((r) => scope === 'all' || (scope === 'shared' ? r.owner_id === null : r.owner_id === me().id))
        .filter((r) => !q || `${r.title} ${r.body}`.toLowerCase().includes(q))
        .sort((a, b) => b.usage_count - a.usage_count || a.title.localeCompare(b.title))
        .slice(0, 50)
      return HttpResponse.json(items.map(out))
    }),
    http.post(`${API}/canned-responses`, async ({ request }) => {
      const body = await request.json()
      state.saves.push({ method: 'POST', body })
      if (body.shared && !isAdmin()) {
        return HttpResponse.json({ message: 'Only admins can create shared responses' }, { status: 403 })
      }
      const response = buildCanned({ title: body.title, body: body.body, owner: body.shared ? null : me().id })
      if (taken(state, response, body.title)) return titleTaken()
      state.responses.push(response)
      return HttpResponse.json(out(response), { status: 201 })
    }),
    http.patch(`${API}/canned-responses/:id`, async ({ params, request }) => {
      const body = await request.json()
      state.saves.push({ method: 'PATCH', id: Number(params.id), body })
      const response = find(params.id)
      if (!response) return HttpResponse.json({ message: 'Canned response not found' }, { status: 404 })
      if (!canEdit(response)) return HttpResponse.json({ message: 'Only admins can change' }, { status: 403 })
      if (body.title && taken(state, response, body.title)) return titleTaken()
      Object.assign(response, body, { updated_at: new Date().toISOString() })
      return HttpResponse.json(out(response))
    }),
    http.delete(`${API}/canned-responses/:id`, ({ params }) => {
      const response = find(params.id)
      if (!response) return HttpResponse.json({ message: 'Canned response not found' }, { status: 404 })
      state.deletes.push(response.id)
      state.responses = state.responses.filter((r) => r !== response)
      return new HttpResponse(null, { status: 204 })
    }),
    http.post(`${API}/canned-responses/:id/used`, ({ params }) => {
      state.used.push(Number(params.id))
      const response = find(params.id)
      if (response) response.usage_count += 1
      return new HttpResponse(null, { status: 204 })
    }),
  )
  return state
}
