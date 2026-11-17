// kb.js – knowledge-base requests (backend README, "Knowledge base"). Lists answer { items, total, page, pageSize };
// a check that fails is 422 with { message, errors: [{ field, message }] }.
import client from './client'

export const getCategories = () => client.get('/kb/categories').then((res) => res.data)
export const createCategory = (fields) => client.post('/kb/categories', fields).then((res) => res.data)
export const updateCategory = (id, fields) => client.patch(`/kb/categories/${id}`, fields).then((res) => res.data)
export const deleteCategory = (id) => client.delete(`/kb/categories/${id}`)

// params: { category, q, status, page, pageSize, sort, order }; empty values are left out
export function listArticles(params = {}, config = {}) {
  const query = Object.fromEntries(Object.entries(params).filter(([, value]) => value !== undefined && value !== ''))
  return client.get('/kb/articles', { ...config, params: query }).then((res) => res.data)
}

export const getArticle = (slug, config = {}) =>
  client.get(`/kb/articles/${encodeURIComponent(slug)}`, config).then((res) => res.data)
export const createArticle = (fields) => client.post('/kb/articles', fields).then((res) => res.data)
// fields must include the updated_at the article was loaded with (409 ARTICLE_CHANGED if someone saved since)
export const updateArticle = (id, fields) => client.patch(`/kb/articles/${id}`, fields).then((res) => res.data)
export const deleteArticle = (id) => client.delete(`/kb/articles/${id}`)

// The server's per-field messages ({ field: message }), from a 422 or a 409 that names a field
export function fieldErrors(err) {
  const errors = {}
  for (const { field, message } of err?.response?.data?.errors ?? []) errors[field] ??= message
  return errors
}
