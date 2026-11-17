// KbSearch.jsx – knowledge-base search results at /kb/search?q=…&page=: most relevant first, with the searched words
// marked in each title and excerpt (as text, never HTML). A search shorter than 2 characters asks for more instead.
// Staff see published articles here too (drafts are on Manage).
import { SearchX } from 'lucide-react'
import { useCallback } from 'react'
import { Link, useSearchParams } from 'react-router'
import ArticleList from '../../components/kb/ArticleList'
import SearchForm from '../../components/kb/SearchForm'
import Pagination from '../../components/Pagination'
import { Alert, EmptyState, PageHeader, Spinner } from '../../components/Ui'
import { t } from '../../i18n'
import { SEARCH_MAX, SEARCH_MIN } from '../../utils/kb'
import { readPaging, withPaging } from '../../utils/pagination'
import usePagedArticles from './usePagedArticles'

export default function KbSearch() {
  const [params, setParams] = useSearchParams()
  const q = (params.get('q') ?? '').trim()
  const { page, pageSize } = readPaging(params, [])
  const valid = q.length >= SEARCH_MIN && q.length <= SEARCH_MAX

  const goToPage = useCallback((next) => setParams((current) => withPaging(current, { page: next })), [setParams])
  const goToFallbackPage = useCallback(
    (next) => setParams((current) => withPaging(current, { page: next }), { replace: true }),
    [setParams],
  )
  const results = usePagedArticles(
    { q, status: 'published', page, pageSize },
    { enabled: valid, onFallbackPage: goToFallbackPage },
  )
  // Only results for this search: older ones would show under the new words while it loads
  const shown = results.page

  return (
    <>
      <nav aria-label={t('kb.breadcrumb')} className="breadcrumb">
        <Link to="/kb">{t('kb.title')}</Link>
      </nav>
      <PageHeader title={t('kb.search.title')} />
      {/* A new search remounts the form with its text */}
      <SearchForm key={q} initialQuery={q} />

      {!valid && (
        <Alert tone="info">
          {q.length > SEARCH_MAX
            ? t('kb.search.tooLong', { max: SEARCH_MAX })
            : t('kb.search.tooShort', { min: SEARCH_MIN })}
        </Alert>
      )}

      {valid && results.error && (
        <Alert>
          <p>{t('kb.loadError')}</p>
          <button type="button" className="btn btn--sm btn--secondary" onClick={results.reload}>
            {t('kb.retry')}
          </button>
        </Alert>
      )}
      {valid && !results.error && !shown && <Spinner label={t('kb.loading')} />}

      {valid && !results.error && shown && (
        <section className="card card--padded" aria-busy={results.loading || undefined}>
          {shown.total === 0 ? (
            <EmptyState
              icon={SearchX}
              title={t('kb.search.noResults', { q })}
              action={
                <Link to="/kb" className="btn btn--secondary">
                  {t('kb.search.backToKb')}
                </Link>
              }
            >
              {t('kb.search.noResultsHelp')}
            </EmptyState>
          ) : (
            <>
              <p className="results-bar" role="status">
                {t('kb.search.results', { count: shown.total, q })}
              </p>
              <ArticleList articles={shown.items} query={q} label={t('kb.search.title')} />
              <Pagination
                page={page}
                pageSize={pageSize}
                total={shown.total}
                onPage={goToPage}
                onPageSize={(size) =>
                  setParams((current) => withPaging(current, { pageSize: size }), { replace: true })
                }
                label={t('kb.category.pages')}
              />
            </>
          )}
        </section>
      )}
    </>
  )
}
