// ArticleList.jsx – knowledge-base articles as a list: title (a link), category, excerpt and date. Used by the home
// page, a category and search (which highlights the searched words). Staff also see which ones are drafts.
import { FileText } from 'lucide-react'
import { Link } from 'react-router'
import { t } from '../../i18n'
import { formatDate, timeAgo } from '../../utils/format'
import Highlight from './Highlight'

export default function ArticleList({ articles, query = '', showCategory = true, label }) {
  return (
    <ul className="kb-list" aria-label={label}>
      {articles.map((article) => {
        const date = article.published_at ?? article.updated_at
        return (
          <li key={article.id} className="kb-list__item">
            <FileText size={18} aria-hidden="true" className="kb-list__icon" />
            <div className="kb-list__text">
              <Link to={`/kb/${article.slug}`} className="kb-list__title">
                <Highlight text={article.title} query={query} />
              </Link>
              {article.summary && (
                <p className="kb-list__excerpt">
                  <Highlight text={article.summary} query={query} />
                </p>
              )}
              <p className="kb-list__meta">
                {showCategory && (
                  <>
                    <Link to={`/kb/c/${article.category.slug}`}>{article.category.name}</Link>
                    {' · '}
                  </>
                )}
                <time dateTime={date} title={formatDate(date)}>
                  {timeAgo(date)}
                </time>
                {article.status === 'draft' && <span className="badge badge--kb-draft">{t('kb.draftBadge')}</span>}
              </p>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
