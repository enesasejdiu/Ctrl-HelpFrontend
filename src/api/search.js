// search.js – GET /api/search/suggestions: open tickets the user may see and published help articles that look like
// what they are typing (backend README "Similar tickets and articles").
import client from './client'

// → { tickets: [{ id, number, title, status, updated_at }], articles: [{ slug, title, summary }] }
export async function getSuggestions(q, { signal } = {}) {
  const { data } = await client.get('/search/suggestions', { params: { q }, signal })
  return data
}
