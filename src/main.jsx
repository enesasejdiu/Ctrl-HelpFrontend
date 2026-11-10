// main.jsx – entry point: starts error monitoring, then mounts the app on a data router (routes in router.jsx).
// AppErrorBoundary is outermost, so even a crash in the router shows the error page.
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import './index.css'
import AppErrorBoundary from './errors/AppErrorBoundary.jsx'
import { logError } from './errors/logger.js'
import { initMonitoring } from './errors/monitoring.js'
import { appRoutes } from './router.jsx'

// Loads Sentry in the background when VITE_SENTRY_DSN is set; reports made before it's ready wait for it
initMonitoring()

const router = createBrowserRouter(appRoutes)

createRoot(document.getElementById('root'), {
  // The boundaries already log what they catch (with the reference they show), so React's own copy is skipped
  onCaughtError: () => {},
  // Only reachable if the full-page fallback itself fails to render
  onUncaughtError: (error, info) => logError({ error, kind: 'uncaught', componentStack: info.componentStack }),
}).render(
  <StrictMode>
    <AppErrorBoundary>
      <RouterProvider router={router} />
    </AppErrorBoundary>
  </StrictMode>,
)
