// usePagedArticles.js – one page of knowledge-base articles for a query (category, q, status, page, pageSize, sort),
// for the category page, search and Manage. The query comes from the URL; an answer for an older query is ignored,
// and a page past the end (e.g. after a delete) moves to the new last page through onFallbackPage.
import { useCallback, useEffect, useState } from 'react'
import { listArticles } from '../../api/kb'
import { fallbackPage } from '../../utils/pagination'

export default function usePagedArticles(query, { enabled = true, onFallbackPage } = {}) {
  const key = JSON.stringify(query)
  // The last finished request: which query it was for, and its page or error
  const [state, setState] = useState({ key: null, page: null, error: null })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!enabled) return undefined
    let current = true
    listArticles(JSON.parse(key))
      .then((page) => {
        if (!current) return
        const fallback = fallbackPage(page, JSON.parse(key).page ?? 1)
        if (fallback && onFallbackPage) onFallbackPage(fallback)
        setState({ key, page, error: null })
      })
      .catch((error) => current && setState({ key, page: null, error }))
    return () => {
      current = false
    }
  }, [key, enabled, attempt, onFallbackPage])

  const reload = useCallback(() => setAttempt((n) => n + 1), [])
  const loading = enabled && state.key !== key
  return {
    page: loading ? null : state.page,
    // The previous page stays visible while the next one loads
    stalePage: state.page,
    error: loading ? null : state.error,
    loading,
    reload,
  }
}
