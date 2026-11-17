// KbCategory.jsx – one knowledge-base category at /kb/c/:categorySlug: its published articles, newest first, paged
// (?page=&pageSize= in the URL). An unknown category shows "not found".
import { FileText } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { getCategories } from '../../api/kb'
import ArticleList from '../../components/kb/ArticleList'
import SearchForm from '../../components/kb/SearchForm'
import NotFound from '../../components/NotFound'
import Pagination from '../../components/Pagination'
import { Alert, EmptyState, PageHeader, Spinner } from '../../components/Ui'
import { t } from '../../i18n'
import { rangeLabel, readPaging, withPaging } from '../../utils/pagination'
import usePagedArticles from './usePagedArticles'

export default function KbCategory() {
  const { categorySlug } = useParams()
  const [params, setParams] = useSearchParams()
  const { page, pageSize } = readPaging(params, [])
  // The category for the slug it was looked up for (loading while that's another slug): null when there is none
  const [lookup, setLookup] = useState({ slug: null, category: undefined, error: false })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let current = true
    getCategories()
      .then(
        (list) =>
          current &&
          setLookup({ slug: categorySlug, category: list.find((c) => c.slug === categorySlug) ?? null, error: false }),
      )
      .catch(() => current && setLookup({ slug: categorySlug, category: undefined, error: true }))
    return () => {
      current = false
    }
  }, [categorySlug, attempt])

  const looked = lookup.slug === categorySlug
  const category = looked ? lookup.category : undefined
  const categoryError = looked && lookup.error

  const goToPage = useCallback((next) => setParams((current) => withPaging(current, { page: next })), [setParams])
  const goToFallbackPage = useCallback(
    (next) => setParams((current) => withPaging(current, { page: next }), { replace: true }),
    [setParams],
  )
  const articles = usePagedArticles(
    { category: categorySlug, status: 'published', page, pageSize, sort: 'published_at' },
    { enabled: Boolean(category), onFallbackPage: goToFallbackPage },
  )

  if (category === null) return <NotFound message={t('kb.category.notFound')} />

  const retry = () => {
    setLookup({ slug: null, category: undefined, error: false })
    setAttempt((n) => n + 1)
    articles.reload()
  }
  const failed = categoryError || articles.error
  const shown = articles.page ?? articles.stalePage

  return (
    <>
      <nav aria-label={t('kb.breadcrumb')} className="breadcrumb">
        <Link to="/kb">{t('kb.title')}</Link>
      </nav>
      <PageHeader title={category?.name ?? t('kb.title')} />
      <SearchForm />

      {failed && (
        <Alert>
          <p>{t('kb.loadError')}</p>
          <button type="button" className="btn btn--sm btn--secondary" onClick={retry}>
            {t('kb.retry')}
          </button>
        </Alert>
      )}
      {!failed && !shown && <Spinner label={t('kb.loading')} />}

      {shown && !failed && (
        <section className="card card--padded" aria-busy={articles.loading || undefined}>
          {shown.total === 0 ? (
            <EmptyState icon={FileText} title={t('kb.category.empty')} />
          ) : (
            <>
              <p className="results-bar" role="status">
                {rangeLabel({ ...shown, count: shown.items.length })}
              </p>
              <ArticleList articles={shown.items} showCategory={false} label={category?.name} />
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
