// AppErrorBoundary.jsx – the last line of defense, around the whole app (main.jsx), outside the router: it catches what
// nothing inside does, including the router itself failing. Full-page fallback (PageErrorBoundary).
// It also hosts GlobalErrorListener, so errors outside rendering are logged too.
import GlobalErrorListener from './GlobalErrorListener'
import PageErrorBoundary from './PageErrorBoundary'

export default function AppErrorBoundary({ children }) {
  return (
    <PageErrorBoundary>
      <GlobalErrorListener />
      {children}
    </PageErrorBoundary>
  )
}
