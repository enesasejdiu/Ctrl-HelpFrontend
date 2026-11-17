// KbHome.jsx – the knowledge base at /kb: a search box, the categories (name and how many articles), and the 10 newest
// published articles. Everyone signed in; staff also get links to manage articles and write a new one.
import { BookOpen, FolderOpen, SquarePen, Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { getCategories, listArticles } from '../../api/kb'
import ArticleList from '../../components/kb/ArticleList'
import SearchForm from '../../components/kb/SearchForm'
import { Alert, EmptyState, PageHeader, Spinner } from '../../components/Ui'
import { useAuth } from '../../context/auth'
import { t } from '../../i18n'

const LATEST = 10

export default function KbHome() {
  const { isStaff } = useAuth()
  // null until loaded; error: the load failed (Try again loads again: a new attempt)
  const [state, setState] = useState({ categories: null, latest: null, error: false })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let current = true
    Promise.all([getCategories(), listArticles({ status: 'published', pageSize: LATEST, sort: 'published_at' })])
      .then(([categories, latest]) => current && setState({ categories, latest: latest.items, error: false }))
      .catch(() => current && setState({ categories: null, latest: null, error: true }))
    return () => {
      current = false
    }
  }, [attempt])

  function retry() {
    setState({ categories: null, latest: null, error: false })
    setAttempt((n) => n + 1)
  }

  const loading = !state.error && state.categories === null

  return (
    <>
      <PageHeader
        title={t('kb.title')}
        subtitle={t('kb.subtitle')}
        actions={
          isStaff && (
            <>
              <Link to="/kb/manage" className="btn btn--secondary">
                <SquarePen size={16} aria-hidden="true" />
                {t('kb.manageLink')}
              </Link>
              <Link to="/kb/new" className="btn btn--primary">
                <Plus size={16} aria-hidden="true" />
                {t('kb.newArticle')}
              </Link>
            </>
          )
        }
      />

      <SearchForm />

      {state.error && (
        <Alert>
          <p>{t('kb.loadError')}</p>
          <button type="button" className="btn btn--sm btn--secondary" onClick={retry}>
            {t('kb.retry')}
          </button>
        </Alert>
      )}
      {loading && <Spinner label={t('kb.loading')} />}

      {state.categories && (
        <section className="kb-section" aria-labelledby="kb-categories">
          <h2 id="kb-categories" className="panel-title">
            {t('kb.home.categories')}
          </h2>
          {state.categories.length === 0 ? (
            <EmptyState icon={FolderOpen} title={t('kb.home.noCategories')}>
              {isStaff && t('kb.home.noCategoriesStaff')}
            </EmptyState>
          ) : (
            <ul className="kb-categories">
              {state.categories.map((category) => (
                <li key={category.id}>
                  <Link to={`/kb/c/${category.slug}`} className="kb-category card">
                    <FolderOpen size={20} aria-hidden="true" className="kb-category__icon" />
                    <span className="kb-category__name">{category.name}</span>
                    <span className="kb-category__count">
                      {t('kb.home.articleCount', { count: category.published_count })}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {state.latest && (
        <section className="kb-section card card--padded" aria-labelledby="kb-latest">
          <h2 id="kb-latest" className="panel-title">
            {t('kb.home.latest')}
          </h2>
          {state.latest.length === 0 ? (
            <EmptyState icon={BookOpen} title={t('kb.home.noArticles')}>
              {t('kb.home.noArticlesHelp')}
            </EmptyState>
          ) : (
            <ArticleList articles={state.latest} label={t('kb.home.latest')} />
          )}
        </section>
      )}
    </>
  )
}
