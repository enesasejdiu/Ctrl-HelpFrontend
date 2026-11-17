// kb.js – the knowledge base's rules as the browser checks them (the same limits as the backend's schemas/kb.js, so
// the editor can show a message under a field before saving; the server's check is the one that counts), and the
// search highlighting.
import { t } from '../i18n'

export const TITLE_MIN = 5
export const TITLE_MAX = 200
export const SUMMARY_MAX = 300
export const BODY_MAX = 100_000
export const SLUG_MAX = 220
export const CATEGORY_NAME_MAX = 60
export const SEARCH_MIN = 2
export const SEARCH_MAX = 200
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

// The editor's fields → { field: message } for each one that breaks a rule (empty when all is fine)
export function validateArticle({ title, slug, summary, body, category_id: categoryId }, { checkSlug = false } = {}) {
  const errors = {}
  const cleanTitle = title.trim()
  if (!cleanTitle) errors.title = t('kb.error.titleRequired')
  else if (cleanTitle.length < TITLE_MIN) errors.title = t('kb.error.titleShort', { min: TITLE_MIN })
  else if (cleanTitle.length > TITLE_MAX) errors.title = t('kb.error.titleLong', { max: TITLE_MAX })
  if (checkSlug) {
    if (!slug) errors.slug = t('kb.error.slugRequired')
    else if (slug.length > SLUG_MAX) errors.slug = t('kb.error.slugLong', { max: SLUG_MAX })
    else if (!SLUG.test(slug)) errors.slug = t('kb.error.slugFormat')
  }
  if (summary.trim().length > SUMMARY_MAX) errors.summary = t('kb.error.summaryLong', { max: SUMMARY_MAX })
  if (!body.trim()) errors.body = t('kb.error.bodyRequired')
  else if (body.length > BODY_MAX) errors.body = t('kb.error.bodyLong', { max: BODY_MAX.toLocaleString('en-US') })
  if (!categoryId) errors.category_id = t('kb.error.categoryRequired')
  return errors
}

// The words of a search, for highlighting: 3+ characters (the search index ignores shorter ones), at most 10
export function searchWords(query) {
  const words = String(query ?? '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length >= 3)
  return [...new Set(words)].slice(0, 10)
}

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Splits text into parts, each { text, match }, where match marks a search word (whole word or the start of one, any
// case). The caller renders the matches in <mark>; everything stays text, never HTML.
export function highlightParts(text, query) {
  const value = String(text ?? '')
  const words = searchWords(query)
  if (words.length === 0 || !value) return [{ text: value, match: false }]
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}])(${words.map(escapeRegExp).join('|')})`, 'giu')
  const parts = []
  let last = 0
  for (const found of value.matchAll(pattern)) {
    if (found.index > last) parts.push({ text: value.slice(last, found.index), match: false })
    parts.push({ text: found[0], match: true })
    last = found.index + found[0].length
  }
  if (last < value.length) parts.push({ text: value.slice(last), match: false })
  return parts
}
