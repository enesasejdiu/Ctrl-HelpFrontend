// NotFound.jsx – the "Page not found" content: for URLs that match no route (pages/NotFoundPage.jsx) and, with a
// `message`, for a record that doesn't exist, e.g. a deleted ticket (<NotFound message={t('notFound.ticket')} />).
// While it's shown, the tab title says so and search engines are asked not to index the page.
// Styled like the error screen's card, but with its own icon and no error colours: nothing broke.
import { SearchX } from 'lucide-react'
import { Fragment, useEffect, useRef } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { useAuth } from '../context/auth'
import { t, tNodes } from '../i18n'
import { displayPath, hasInAppHistory } from '../utils/requestedPath'

// Tab title and <meta name="robots" content="noindex">, both undone when the page goes away
function useNotFoundDocument() {
  useEffect(() => {
    const previousTitle = document.title
    document.title = t('notFound.documentTitle', { app: t('app.name') })
    const robots = document.createElement('meta')
    robots.name = 'robots'
    robots.content = 'noindex'
    document.head.append(robots)
    return () => {
      document.title = previousTitle
      robots.remove()
    }
  }, [])
}

export default function NotFound({ message }) {
  const { user } = useAuth()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const headingRef = useRef(null)
  useNotFoundDocument()

  // Keyboard and screen-reader users start at the heading
  useEffect(() => {
    headingRef.current?.focus()
  }, [])

  const path = <code>{displayPath(pathname)}</code>

  return (
    <div className="not-found">
      <div className="not-found__card">
        <span className="not-found__icon">
          <SearchX size={22} aria-hidden="true" />
        </span>
        <h1 ref={headingRef} tabIndex={-1}>
          {t('notFound.title')}
        </h1>
        <p>{message ?? t('notFound.text')}</p>
        <p className="not-found__path">
          {tNodes('notFound.path', { path }).map((part, index) => (
            <Fragment key={index}>{part}</Fragment>
          ))}
        </p>
        <div className="not-found__actions">
          {/* Logged out, "home" is the login page */}
          <Link to={user ? '/tickets' : '/login'} className="btn btn--primary">
            {t('notFound.home')}
          </Link>
          {hasInAppHistory() && (
            <button type="button" className="btn btn--secondary" onClick={() => navigate(-1)}>
              {t('notFound.back')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
