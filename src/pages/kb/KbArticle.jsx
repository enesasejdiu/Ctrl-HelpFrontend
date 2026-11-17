// KbArticle.jsx – one knowledge-base article at /kb/:slug: title, category, "Updated <date> by <name>", the article
// (Markdown, rendered and sanitized), a table of contents when it has 3+ headings, and up to 5 more articles from the
// same category. Staff see drafts too, marked as such, with an Edit button. An unknown article, or a draft for
// everyone else, shows "not found" (the API answers 404 for both).
import { Pencil } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'
import { getArticle, listArticles } from '../../api/kb'
import { isNotFound } from '../../api/client'
import ArticleList from '../../components/kb/ArticleList'
import MarkdownView from '../../components/kb/MarkdownView'
import NotFound from '../../components/NotFound'
import { Alert, Spinner } from '../../components/Ui'
import { useAuth } from '../../context/auth'
import { t } from '../../i18n'
import { formatDate } from '../../utils/format'
import { renderMarkdown } from '../../utils/markdown'

const MORE = 5
const TOC_MIN_HEADINGS = 3

export default function KbArticle() {
  const { slug } = useParams()
  // A new slug gets a fresh page, so nothing from the previous article stays on screen
  return <ArticlePage key={slug} slug={slug} />
}

function ArticlePage({ slug }) {
  const { isStaff } = useAuth()
  const [state, setState] = useState({ article: null, error: null })
  const [more, setMore] = useState([])
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let current = true
    getArticle(slug)
      .then((article) => current && setState({ article, error: null }))
      .catch((error) => current && setState({ article: null, error }))
    return () => {
      current = false
    }
  }, [slug, attempt])

  const article = state.article
  // "More in <category>": published articles of the same category, without this one. Not shown if it fails.
  useEffect(() => {
    if (!article) return undefined
    let current = true
    listArticles({ category: article.category.slug, status: 'published', pageSize: MORE + 1, sort: 'published_at' })
      .then((page) => current && setMore(page.items.filter((item) => item.id !== article.id).slice(0, MORE)))
      .catch(() => current && setMore([]))
    return () => {
      current = false
    }
  }, [article])

  useEffect(() => {
    if (!article) return undefined
    const previous = document.title
    document.title = t('kb.documentTitle', { title: article.title })
    return () => {
      document.title = previous
    }
  }, [article])

  const headings = useMemo(() => (article ? renderMarkdown(article.body).headings : []), [article])

  if (state.error && isNotFound(state.error)) return <NotFound message={t('kb.article.notFound')} />
  if (state.error) {
    return (
      <Alert>
        <p>{t('kb.loadError')}</p>
        <button type="button" className="btn btn--sm btn--secondary" onClick={() => setAttempt((n) => n + 1)}>
          {t('kb.retry')}
        </button>
      </Alert>
    )
  }
  if (!article) return <Spinner label={t('kb.loading')} />

  const updatedBy = article.updated_by?.name
  return (
    <div className="kb-article-layout">
      <article className="kb-article card card--padded" aria-labelledby="kb-article-title">
        <nav aria-label={t('kb.breadcrumb')} className="breadcrumb">
          <Link to="/kb">{t('kb.title')}</Link>
          <span aria-hidden="true"> / </span>
          <Link to={`/kb/c/${article.category.slug}`}>{article.category.name}</Link>
        </nav>
        <header className="kb-article__header">
          <h1 id="kb-article-title" className="kb-article__title">
            {article.title}
          </h1>
          {isStaff && (
            <Link to={`/kb/${article.slug}/edit`} className="btn btn--secondary btn--sm">
              <Pencil size={14} aria-hidden="true" />
              {t('kb.article.edit')}
            </Link>
          )}
        </header>
        <p className="kb-article__meta">
          <time dateTime={article.updated_at}>
            {updatedBy
              ? t('kb.article.updated', { date: formatDate(article.updated_at), name: updatedBy })
              : t('kb.article.updatedNoName', { date: formatDate(article.updated_at) })}
          </time>
        </p>
        {article.status === 'draft' && <Alert tone="warning">{t('kb.article.draftNotice')}</Alert>}
        <MarkdownView source={article.body} />
      </article>

      <aside className="kb-article-aside">
        {headings.length >= TOC_MIN_HEADINGS && (
          <nav className="card card--padded kb-toc" aria-labelledby="kb-toc-title">
            <h2 id="kb-toc-title" className="panel-title">
              {t('kb.article.toc')}
            </h2>
            <ol className="kb-toc__list">
              {headings.map((heading) => (
                <li key={heading.id} className={`kb-toc__item kb-toc__item--h${Math.min(heading.level, 3)}`}>
                  <a href={`#${heading.id}`}>{heading.text}</a>
                </li>
              ))}
            </ol>
          </nav>
        )}
        {more.length > 0 && (
          <section className="card card--padded" aria-labelledby="kb-more-title">
            <h2 id="kb-more-title" className="panel-title">
              {t('kb.article.more', { category: article.category.name })}
            </h2>
            <ArticleList
              articles={more}
              showCategory={false}
              label={t('kb.article.more', { category: article.category.name })}
            />
          </section>
        )}
      </aside>
    </div>
  )
}
