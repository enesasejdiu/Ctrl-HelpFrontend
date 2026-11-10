// router.jsx – the route objects for the data router (createBrowserRouter in main.jsx; tests use createMemoryRouter with
// the same list). One splat route holds the whole app, whose pages are defined with <Routes> in App.jsx.
//
// In a data router, React Router puts its own error boundary around the root route. So the root route's element
// starts with PageErrorBoundary, which catches crashes first and shows the app's error page, and the route's
// ErrorBoundary passes anything that still gets through on to AppErrorBoundary. A route added here with its own
// element needs the same.
import App from './App'
import { AuthProvider } from './context/AuthContext'
import PageErrorBoundary from './errors/PageErrorBoundary'
import RethrowRouteError from './errors/RethrowRouteError'

export const appRoutes = [
  {
    path: '*',
    element: (
      <PageErrorBoundary>
        <AuthProvider>
          <App />
        </AuthProvider>
      </PageErrorBoundary>
    ),
    ErrorBoundary: RethrowRouteError,
  },
]
