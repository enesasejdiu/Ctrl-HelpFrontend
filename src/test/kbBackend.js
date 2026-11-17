// kbBackend.js – an in-memory knowledge-base API for the tests (MSW), following the backend's rules (README
// "Knowledge base"): drafts are hidden from non-staff (404), lists are paged { items, total, page, pageSize }, a save
// needs the current updated_at (409 ARTICLE_CHANGED), and checks fail with 422 { message, errors }.
// mockKb({ categories, articles }) installs it and returns its state (data, and every list request's params).
import { http, HttpResponse } from 'msw'
import { API, server, session } from './server'

let nextId = 1000

export function buildCategory(overrides = {}) {
  const id = overrides.id ?? nextId++
  const name = overrides.name ?? `Category ${id}`
  return { id, name, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), sort_order: 0, ...overrides }
}

export function buildArticle(overrides = {}) {
  const id = overrides.id ?? nextId++
  const title = overrides.title ?? `Article ${id}`
  const status = overrides.status ?? 'published'
  return {
    id,
    slug: title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, ''),
    title,
    summary: null,
    body: `Text of ${title}.`,
    category: { id: 1, name: 'Email', slug: 'email' },
    status,
    published_at: status === 'published' ? '2026-11-10T09:00:00.000Z' : null,
    created_at: '2026-11-01T09:00:00.000Z',
    updated_at: '2026-11-10T09:00:00.123Z',
    author: { id: 7, name: 'Arben Krasniqi' },
    updated_by: { id: 7, name: 'Arben Krasniqi' },
    ...overrides,
  }
}

const isStaff = () => ['agent', 'admin'].includes(session.user?.role)
// A list item has no author, editor or creation time, like the backend's list
const listItem = ({ body, author: _author, updated_by: _updatedBy, created_at: _createdAt, ...item }) => ({
  ...item,
  summary: item.summary ?? body.slice(0, 200),
})
const notFound = () => HttpResponse.json({ message: 'Article not found' }, { status: 404 })
const invalid = (field, message) => HttpResponse.json({ message, errors: [{ field, message }] }, { status: 422 })

export function mockKb({ categories = [buildCategory({ id: 1, name: 'Email' })], articles = [] } = {}) {
  // Copies, so a test that edits data never changes the objects another test passes in
  const state = {
    categories: structuredClone(categories),
    articles: structuredClone(articles),
    listRequests: [],
    saves: [],
    deletes: [],
  }

  const categoryOf = (id) => state.categories.find((c) => c.id === Number(id))
  const withCategory = (article) => {
    const category = categoryOf(article.category.id) ?? article.category
    return { ...article, category: { id: category.id, name: category.name, slug: category.slug } }
  }

  server.use(
    http.get(`${API}/kb/categories`, () =>
      HttpResponse.json(
        state.categories.map((c) => ({
          ...c,
          published_count: state.articles.filter((a) => a.category.id === c.id && a.status === 'published').length,
        })),
      ),
    ),
    http.post(`${API}/kb/categories`, async ({ request }) => {
      const body = await request.json()
      if (state.categories.some((c) => c.name.toLowerCase() === body.name.toLowerCase())) {
        return HttpResponse.json(
          { message: `There is already a category called "${body.name}"`, code: 'CATEGORY_EXISTS' },
          { status: 409 },
        )
      }
      const category = buildCategory(body)
      state.categories.push(category)
      return HttpResponse.json({ ...category, published_count: 0 }, { status: 201 })
    }),
    http.patch(`${API}/kb/categories/:id`, async ({ params, request }) => {
      const category = categoryOf(params.id)
      Object.assign(category, await request.json())
      return HttpResponse.json(category)
    }),
    http.delete(`${API}/kb/categories/:id`, ({ params }) => {
      if (state.articles.some((a) => a.category.id === Number(params.id))) {
        return HttpResponse.json(
          { message: 'Move or delete the articles in this category first', code: 'CATEGORY_IN_USE' },
          { status: 409 },
        )
      }
      state.categories = state.categories.filter((c) => c.id !== Number(params.id))
      return new HttpResponse(null, { status: 204 })
    }),

    http.get(`${API}/kb/articles`, ({ request }) => {
      const params = Object.fromEntries(new URL(request.url).searchParams)
      state.listRequests.push(params)
      const status = isStaff() ? (params.status && params.status !== 'all' ? params.status : null) : 'published'
      const q = params.q?.toLowerCase()
      const matches = state.articles
        .map(withCategory)
        .filter((a) => !status || a.status === status)
        .filter((a) => !params.category || a.category.slug === params.category)
        .filter((a) => !q || `${a.title} ${a.summary ?? ''} ${a.body}`.toLowerCase().includes(q))
      const page = Number(params.page ?? 1)
      const pageSize = Number(params.pageSize ?? 25)
      return HttpResponse.json({
        items: matches.slice((page - 1) * pageSize, page * pageSize).map(listItem),
        total: matches.length,
        page,
        pageSize,
      })
    }),
    http.get(`${API}/kb/articles/:slug`, ({ params }) => {
      const article = state.articles.find((a) => a.slug === params.slug)
      if (!article || (article.status !== 'published' && !isStaff())) return notFound()
      return HttpResponse.json(withCategory(article))
    }),
    http.post(`${API}/kb/articles`, async ({ request }) => {
      const body = await request.json()
      state.saves.push({ method: 'POST', body })
      if (body.title.trim().length < 5) return invalid('title', 'Title must be at least 5 characters')
      const article = buildArticle({
        title: body.title,
        summary: body.summary || null,
        body: body.body,
        category: categoryOf(body.category_id),
        status: body.status ?? 'draft',
      })
      state.articles.push(article)
      return HttpResponse.json(withCategory(article), { status: 201 })
    }),
    http.patch(`${API}/kb/articles/:id`, async ({ params, request }) => {
      const body = await request.json()
      state.saves.push({ method: 'PATCH', id: Number(params.id), body })
      const article = state.articles.find((a) => a.id === Number(params.id))
      if (!article) return notFound()
      if (body.updated_at !== article.updated_at) {
        return HttpResponse.json(
          {
            message: 'Someone else changed this article after you opened it',
            code: 'ARTICLE_CHANGED',
            updated_at: article.updated_at,
          },
          { status: 409 },
        )
      }
      const { updated_at: _loaded, category_id: categoryId, status, ...fields } = body
      Object.assign(article, fields)
      if (fields.summary === '') article.summary = null
      if (categoryId) article.category = categoryOf(categoryId)
      if (status) {
        article.status = status
        if (status === 'published' && !article.published_at) article.published_at = '2026-11-12T10:00:00.000Z'
      }
      article.updated_at = new Date(new Date(article.updated_at).getTime() + 1000).toISOString()
      return HttpResponse.json(withCategory(article))
    }),
    http.delete(`${API}/kb/articles/:id`, ({ params }) => {
      state.deletes.push(Number(params.id))
      state.articles = state.articles.filter((a) => a.id !== Number(params.id))
      return new HttpResponse(null, { status: 204 })
    }),
  )
  return state
}
