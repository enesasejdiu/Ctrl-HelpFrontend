// App.jsx – all routes of TicketFlow.
// Public: /login. Everything else needs a login; /change-password has its own full-page frame, the rest renders
// inside <Layout>. /admin is admin-only; /admin/users and /admin/departments are for admins and HR.
// A URL that matches no route shows "Page not found" (NotFoundPage), logged in or not; real routes keep their guards.
// Development builds also have /__crash pages for trying the error screens (see pages/DevCrash.jsx).
import { Suspense, lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import { Spinner } from './components/Ui'
import ChangePassword from './pages/ChangePassword'
import DevCrash from './pages/DevCrash'
import Departments from './pages/Departments'
import SetPassword from './pages/SetPassword'
import Login from './pages/Login'
import NewTicket from './pages/NewTicket'
import NotFoundPage from './pages/NotFoundPage'
import Profile from './pages/Profile'
import TicketDetail from './pages/TicketDetail'
import TicketList from './pages/TicketList'
import Users from './pages/Users'

// The dashboard pulls in the chart library, so it's only downloaded when an admin opens it
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'))

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      {/* Dev only: outside the Layout, so only the full-page fallback catches it */}
      {import.meta.env.DEV && <Route path="/__crash/app" element={<DevCrash kind="app" />} />}

      {/* Routes without a path are wrappers: login check first, then the Layout around each page */}
      <Route element={<ProtectedRoute />}>
        {/* Outside the Layout: a user with a temporary password can't use the pages its menu links to */}
        <Route path="/change-password" element={<ChangePassword />} />

        <Route element={<Layout />}>
          {/* After logging in with a temporary password, the only page until a new one is chosen */}
          <Route path="/set-password" element={<SetPassword />} />
          <Route path="/tickets" element={<TicketList />} />
          <Route path="/tickets/new" element={<NewTicket />} />
          <Route path="/tickets/:id" element={<TicketDetail />} />
          <Route path="/profile" element={<Profile />} />
          {import.meta.env.DEV && <Route path="/__crash" element={<DevCrash />} />}
          {import.meta.env.DEV && <Route path="/__crash/chunk" element={<DevCrash kind="chunk" />} />}

          <Route element={<ProtectedRoute roles={['admin']} />}>
            <Route
              path="/admin"
              element={
                <Suspense fallback={<Spinner label="Loading dashboard…" />}>
                  <AdminDashboard />
                </Suspense>
              }
            />
          </Route>

          <Route element={<ProtectedRoute roles={['admin', 'hr']} />}>
            <Route path="/admin/users" element={<Users />} />
            <Route path="/admin/departments" element={<Departments />} />
          </Route>
        </Route>
      </Route>

      {/* "/" is the ticket list; logged-out users end up on /login from there */}
      <Route path="/" element={<Navigate to="/tickets" replace />} />

      {/* Last, so it only gets what no route above matches. No login needed: see NotFoundPage */}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}

export default App
