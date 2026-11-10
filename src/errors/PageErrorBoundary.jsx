// PageErrorBoundary.jsx – a boundary whose fallback fills the page and leaves by full page loads (the router may be what
// broke). Used twice: by AppErrorBoundary around everything, and inside the router's root route (router.jsx), where it
// catches crashes before React Router's own default error page would.
import { browser } from '../utils/browser'
import ErrorBoundary from './ErrorBoundary'
import ErrorFallback from './ErrorFallback'

export default function PageErrorBoundary({ children }) {
  return (
    <ErrorBoundary
      level="app"
      fallback={({ reset, ...props }) => (
        <ErrorFallback
          variant="page"
          {...props}
          onRetry={reset}
          onHome={() => browser.assign('/')}
          onReload={() => browser.reload()}
        />
      )}
    >
      {children}
    </ErrorBoundary>
  )
}
