// RouteErrorBoundary.jsx – around the page content inside Layout: a page that crashes is replaced by the fallback, while
// the top bar stays usable. Every navigation (a new location key, even to the same URL) clears the error.
import { useLocation, useNavigate } from 'react-router'
import ErrorBoundary from './ErrorBoundary'
import ErrorFallback from './ErrorFallback'

export default function RouteErrorBoundary({ children }) {
  const location = useLocation()
  const navigate = useNavigate()
  return (
    <ErrorBoundary
      level="route"
      resetKey={location.key}
      route={location.pathname}
      fallback={({ reset, ...props }) => (
        <ErrorFallback variant="route" {...props} onRetry={reset} onHome={() => navigate('/')} />
      )}
    >
      {children}
    </ErrorBoundary>
  )
}
