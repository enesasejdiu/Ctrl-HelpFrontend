// markdown.js – turns a knowledge-base article's Markdown into safe HTML, the same way for the article page and the
// editor's preview (components/kb/MarkdownView.jsx is the only place the result is put into the page).
//
// Two layers, so one mistake can't open a hole:
//   1. markdown-it with raw HTML off: <script>, <iframe>, <img onerror=…> and the like stay plain text, never tags.
//      Images are off too (a follow-up), and a link may only be http(s), mailto or relative: javascript:, data:,
//      vbscript:, file: and any other scheme stays text.
//   2. DOMPurify on the result, with an allow-list of the tags Markdown makes (headings, paragraphs, bold/italic,
//      lists, links, code, quotes, tables, rules) and a few attributes. Anything else is removed, whatever made it.
// External links open in a new tab with rel="noopener noreferrer"; headings get ids for the table of contents.
import DOMPurify from 'dompurify'
import MarkdownIt from 'markdown-it'

const ALLOWED_TAGS = [
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'p',
  'br',
  'hr',
  'strong',
  'em',
  's',
  'ul',
  'ol',
  'li',
  'a',
  'code',
  'pre',
  'blockquote',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
]
const ALLOWED_ATTR = ['href', 'title', 'id', 'target', 'rel', 'class', 'start']
// http(s), mailto, or a relative address (/x, #x, ./x, x without a scheme)
const SAFE_URL = /^(?:(?:https?|mailto):|[/#.]|[^:]*$)/i
const SCHEME = /^[a-z][a-z0-9+.-]*:/i

const md = new MarkdownIt({ html: false, linkify: true, typographer: false })
md.disable('image')
// Links with any other scheme aren't made into links at all (markdown-it leaves the text as it was)
md.validateLink = (url) => {
  const href = url.trim()
  return !SCHEME.test(href) || /^(?:https?|mailto):/i.test(href)
}

// A heading's text as an id: lowercase words joined by dashes, accents written plainly (ë → e)
export function headingId(text) {
  return (
    String(text)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'section'
  )
}

// Gives every heading an id (unique within the article) and collects them for the table of contents
md.core.ruler.push('heading_ids', (state) => {
  const used = new Map()
  const headings = []
  state.tokens.forEach((opening, index) => {
    if (opening.type !== 'heading_open') return
    const text = state.tokens[index + 1].children
      .filter((child) => child.type === 'text' || child.type === 'code_inline')
      .map((child) => child.content)
      .join('')
    const base = headingId(text)
    const count = used.get(base) ?? 0
    used.set(base, count + 1)
    const id = count === 0 ? base : `${base}-${count + 1}`
    opening.attrSet('id', id)
    headings.push({ level: Number(opening.tag.slice(1)), id, text })
  })
  state.env.headings = headings
})

const isExternal = (href) => {
  if (!/^https?:/i.test(href)) return false
  try {
    return new URL(href).origin !== window.location.origin
  } catch {
    return true
  }
}

// External links: a new tab, without giving the other site a handle on this page or the address it came from
const defaultLinkOpen =
  md.renderer.rules.link_open ?? ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options))
md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  const link = tokens[idx]
  if (isExternal(link.attrGet('href') ?? '')) {
    link.attrSet('target', '_blank')
    link.attrSet('rel', 'noopener noreferrer')
  }
  return defaultLinkOpen(tokens, idx, options, env, self)
}

const purify = DOMPurify(typeof window === 'undefined' ? undefined : window)
purify.addHook('uponSanitizeAttribute', (node, data) => {
  // Classes only for a code block's language (```js → class="language-js"), so content can't borrow the app's styles
  if (data.attrName === 'class' && !(node.nodeName === 'CODE' && /^language-[\w-]+$/.test(data.attrValue))) {
    data.keepAttr = false
  }
  if (data.attrName === 'target' && data.attrValue !== '_blank') data.keepAttr = false
})
purify.addHook('afterSanitizeAttributes', (node) => {
  // A link that opens a new tab always carries rel, whatever else happened
  if (node.nodeName === 'A' && node.getAttribute('target') === '_blank') {
    node.setAttribute('rel', 'noopener noreferrer')
  }
})

const PURIFY_CONFIG = {
  ALLOWED_TAGS,
  ALLOWED_ATTR,
  ALLOWED_URI_REGEXP: SAFE_URL,
  ALLOW_DATA_ATTR: false,
  ALLOW_ARIA_ATTR: false,
}

// Markdown → { html, headings }. html is safe to put into the page; headings: [{ level, id, text }] in order.
export function renderMarkdown(source) {
  const env = {}
  const html = md.render(String(source ?? ''), env)
  return { html: purify.sanitize(html, PURIFY_CONFIG), headings: env.headings ?? [] }
}
