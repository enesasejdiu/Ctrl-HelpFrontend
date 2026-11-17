// MarkdownView.jsx – a knowledge-base article's Markdown, shown as formatted text: on the article page and in the
// editor's preview, so both always look the same.
// The only place in the app that puts HTML into the page, and only renderMarkdown's output, which DOMPurify has
// already cleaned (utils/markdown.js: no raw HTML, scripts, images, event attributes or javascript:/data: links).
import { useMemo } from 'react'
import { renderMarkdown } from '../../utils/markdown'

export default function MarkdownView({ source, id }) {
  const { html } = useMemo(() => renderMarkdown(source), [source])
  return <div id={id} className="kb-prose" dangerouslySetInnerHTML={{ __html: html }} />
}
