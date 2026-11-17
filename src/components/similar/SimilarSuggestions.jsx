// SimilarSuggestions.jsx – "Is this the same problem?" under the New ticket title: open tickets the user may see and
// help articles that look like the title being typed, so an existing answer can be found before submitting.
//   - shown only when there is something to show: no results, an error or a 429 → nothing at all (no empty box)
//   - links open in a new tab, so the ticket being written stays as it is
//   - "None of these, continue" hides it until the title changes by a few words (utils/titleChange.js)
//   - a polite live region says how many were found; the panel is a labelled region with lists
// It never blocks typing or submitting: it only reads the title.
import { LoaderCircle } from 'lucide-react'
import { useId, useState } from 'react'
import { Link } from 'react-router'
import { t } from '../../i18n'
import { changedEnough } from '../../utils/titleChange'
import { StatusBadge } from '../Badges'
import Highlight from '../kb/Highlight'
import { useSuggestions } from './useSuggestions'

const DAY = 24 * 60 * 60 * 1000

// "updated 2 days ago" / "updated today"; the date after a month
function updatedLabel(value) {
  const days = Math.floor((Date.now() - new Date(value).getTime()) / DAY)
  if (days < 1) return t('suggest.updatedToday')
  if (days < 31) return t('suggest.updatedDaysAgo', { count: days })
  const date = new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  return t('suggest.updatedOn', { date })
}

export default function SimilarSuggestions({ title }) {
  const id = useId()
  // The title when "None of these, continue" was pressed (null: not dismissed)
  const [dismissedFor, setDismissedFor] = useState(null)
  const dismissed = dismissedFor !== null && !changedEnough(dismissedFor, title)
  const { query, results, loading } = useSuggestions(title, { enabled: !dismissed })

  const tickets = results?.tickets ?? []
  const articles = results?.articles ?? []
  const count = tickets.length + articles.length
  const open = !dismissed && count > 0

  return (
    <>
      {/* Always in the page, so screen readers hear it change (polite: it waits until they finish speaking) */}
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {open ? t('suggest.found', { count }) : ''}
      </p>
      {open && (
        <section className="suggest" aria-labelledby={`${id}-title`} aria-busy={loading || undefined}>
          <div className="suggest__inner">
            <div className="suggest__head">
              <h2 id={`${id}-title`} className="suggest__title">
                {t('suggest.title')}
              </h2>
              {loading && <LoaderCircle size={16} className="spin suggest__loading" aria-hidden="true" />}
            </div>
            <p className="suggest__hint">{t('suggest.hint')}</p>

            {tickets.length > 0 && (
              <>
                <h3 id={`${id}-tickets`} className="suggest__group">
                  {t('suggest.tickets')}
                </h3>
                <ul className="suggest__list" aria-labelledby={`${id}-tickets`}>
                  {tickets.map((ticket) => (
                    <li key={ticket.id}>
                      <Link
                        to={`/tickets/${ticket.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="suggest__link"
                      >
                        <span className="suggest__name">
                          <span className="suggest__number">#{ticket.number}</span>{' '}
                          <Highlight text={ticket.title} query={query} />
                        </span>{' '}
                        {/* The spaces between the parts keep them apart in the link's spoken name */}
                        <span className="suggest__meta">
                          <StatusBadge status={ticket.status} /> <span>{updatedLabel(ticket.updated_at)}</span>
                        </span>{' '}
                        <span className="sr-only">{t('suggest.newTab')}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {articles.length > 0 && (
              <>
                <h3 id={`${id}-articles`} className="suggest__group">
                  {t('suggest.articles')}
                </h3>
                <ul className="suggest__list" aria-labelledby={`${id}-articles`}>
                  {articles.map((article) => (
                    <li key={article.slug}>
                      <Link
                        to={`/kb/${article.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="suggest__link"
                      >
                        <span className="suggest__name">
                          <Highlight text={article.title} query={query} />
                        </span>{' '}
                        {article.summary && (
                          <>
                            <span className="suggest__summary">
                              <Highlight text={article.summary} query={query} />
                            </span>{' '}
                          </>
                        )}
                        <span className="sr-only">{t('suggest.newTab')}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            )}

            <button type="button" className="btn btn--secondary btn--sm" onClick={() => setDismissedFor(title)}>
              {t('suggest.dismiss')}
            </button>
          </div>
        </section>
      )}
    </>
  )
}
