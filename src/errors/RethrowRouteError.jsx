// RethrowRouteError.jsx – the root route's ErrorBoundary (router.jsx). React Router catches render errors in a data
// router and would show its own "Unexpected Application Error!" page. Nearly everything is caught by PageErrorBoundary
// first, but if anything still reaches React Router, this throws it on to AppErrorBoundary, so the app's own error page
// shows instead.
import { useRouteError } from 'react-router'

export default function RethrowRouteError() {
  throw useRouteError()
}
