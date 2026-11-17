// KbManage.jsx – /kb/manage, staff only: every knowledge-base article (drafts too) in a table with search, a status
// filter and pages (?q=&status=&page=&pageSize= in the URL), and the categories (KbCategoriesPanel).
import { FileText, Plus, Search, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import Pagination from '../../components/Pagination'
import { Alert, EmptyState, PageHeader, Spinner } from '../../components/Ui'
import { t } from '../../i18n'
import { SEARCH_MIN } from '../../utils/kb'
import { formatDate, timeAgo } from '../../utils/format'
import { rangeLabel, readPaging, withPaging } from '../../utils/pagination'
import KbCategoriesPanel from './KbCategoriesPanel'
import usePagedArticles from './usePagedArticles'

const SEARCH_DELAY_MS = 300
const STATUS_OPTIONS = [
  { value: '', label: 'kb.manage.statusAll' },
  { value: 'draft', label: 'kb.manage.statusDraft' },
  { value: 'published', label: 'kb.manage.statusPublished' },
]

export default function KbManage() {
  const [params, setParams] = useSearchParams()
  const { page, pageSize } = readPaging(params, [])
  const status = ['draft', 'published'].includes(params.get('status')) ? params.get('status') : ''
  const q = (params.get('q') ?? '').trim()
  // The box updates as you type; the URL (and the request) follows after a short pause, from 2 characters
  const [search, setSearch] = useState(q)
  const timer = useRef(null)

  const setFilter = useCallback(
    (changes) => setParams((current) => withPaging(current, changes), { replace: true }),
    [setParams],
  )
  useEffect(() => () => clearTimeout(timer.current), [])

  function changeSearch(value) {
    setSearch(value)
    clearTimeout(timer.current)
    const next = value.trim()
    timer.current = setTimeout(() => setFilter({ q: next.length >= SEARCH_MIN ? next : '' }), SEARCH_DELAY_MS)
  }

  const goToFallbackPage = useCallback(
    (next) => setParams((current) => withPaging(current, { page: next }), { replace: true }),
    [setParams],
  )
  const articles = usePagedArticles(
    { q: q.length >= SEARCH_MIN ? q : '', status: status || 'all', page, pageSize, sort: q ? undefined : 'updated_at' },
    { onFallbackPage: goToFallbackPage },
  )
  const shown = articles.page ?? articles.stalePage
  const filtered = Boolean(q || status)

  return (
    <>
      <nav aria-label={t('kb.breadcrumb')} className="breadcrumb">
        <Link to="/kb">{t('kb.title')}</Link>
      </nav>
      <PageHeader
        title={t('kb.manage.title')}
        subtitle={t('kb.manage.subtitle')}
        actions={
          <Link to="/kb/new" className="btn btn--primary">
            <Plus size={16} aria-hidden="true" />
            {t('kb.newArticle')}
          </Link>
        }
      />

      <section className="card" aria-labelledby="kb-manage-articles">
        <h2 id="kb-manage-articles" className="sr-only">
          {t('kb.manage.tableLabel')}
        </h2>
        <div className="toolbar" role="search">
          <div className="search-input">
            <Search size={16} aria-hidden="true" className="search-input__icon" />
            <input
              type="search"
              className="input"
              value={search}
              onChange={(e) => changeSearch(e.target.value)}
              aria-label={t('kb.manage.searchLabel')}
            />
            {search && (
              <button
                type="button"
                className="search-input__clear"
                aria-label={t('kb.manage.clearSearch')}
                onClick={() => {
                  clearTimeout(timer.current)
                  setSearch('')
                  setFilter({ q: '' })
                }}
              >
                <X size={14} aria-hidden="true" />
              </button>
            )}
          </div>
          <select
            className="select"
            value={status}
            onChange={(e) => setFilter({ status: e.target.value })}
            aria-label={t('kb.manage.statusLabel')}
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {t(option.label)}
              </option>
            ))}
          </select>
        </div>

        {articles.error && (
          <Alert>
            <p>{t('kb.loadError')}</p>
            <button type="button" className="btn btn--sm btn--secondary" onClick={articles.reload}>
              {t('kb.retry')}
            </button>
          </Alert>
        )}
        {!articles.error && !shown && <Spinner label={t('kb.loading')} />}

        {!articles.error && shown && shown.total === 0 && (
          <EmptyState icon={FileText} title={filtered ? t('kb.manage.noMatch') : t('kb.manage.empty')}>
            {!filtered && t('kb.manage.emptyHelp')}
          </EmptyState>
        )}

        {!articles.error && shown && shown.total > 0 && (
          <div aria-busy={articles.loading || undefined}>
            <p className="results-bar" role="status">
              {rangeLabel({ ...shown, count: shown.items.length })}
            </p>
            <div className="table-wrap">
              <table className="table">
                <caption className="sr-only">{t('kb.manage.tableLabel')}</caption>
                <thead>
                  <tr>
                    <th scope="col">{t('kb.manage.colTitle')}</th>
                    <th scope="col">{t('kb.manage.colCategory')}</th>
                    <th scope="col">{t('kb.manage.colStatus')}</th>
                    <th scope="col">{t('kb.manage.colUpdated')}</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.items.map((article) => (
                    <tr key={article.id}>
                      <td>
                        <Link to={`/kb/${article.slug}/edit`}>{article.title}</Link>
                      </td>
                      <td>{article.category.name}</td>
                      <td>
                        <span className={`badge badge--kb-${article.status}`}>
                          {article.status === 'draft' ? t('kb.draftBadge') : t('kb.publishedBadge')}
                        </span>
                      </td>
                      <td>
                        <time dateTime={article.updated_at} title={formatDate(article.updated_at)}>
                          {timeAgo(article.updated_at)}
                        </time>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={page}
              pageSize={pageSize}
              total={shown.total}
              onPage={(next) => setParams((current) => withPaging(current, { page: next }))}
              onPageSize={(size) => setFilter({ pageSize: size })}
              label={t('kb.manage.pages')}
            />
          </div>
        )}
      </section>

      <KbCategoriesPanel />
    </>
  )
}
