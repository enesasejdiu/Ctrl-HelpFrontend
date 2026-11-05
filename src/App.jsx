// App.jsx – all routes of TicketFlow.
// Public: /login, /register. Everything else needs a login and renders inside <Layout>; /admin/* is admin-only.
import { Suspense, lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import { Spinner } from './components/Ui'
import ComingSoon from './pages/ComingSoon'
import Login from './pages/Login'
import NewTicket from './pages/NewTicket'
import Register from './pages/Register'
import TicketList from './pages/TicketList'
import Users from './pages/Users'

// The dashboard pulls in the chart library, so it's only downloaded when an admin opens it
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'))

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route path="/tickets" element={<TicketList />} />
          <Route path="/tickets/new" element={<NewTicket />} />
          <Route path="/tickets/:id" element={<ComingSoon title="Ticket details" />} />

          <Route element={<ProtectedRoute roles={['admin']} />}>
            <Route
              path="/admin"
              element={
                <Suspense fallback={<Spinner label="Loading dashboard…" />}>
                  <AdminDashboard />
                </Suspense>
              }
            />
            <Route path="/admin/users" element={<Users />} />
          </Route>
        </Route>
      </Route>

      {/* Unknown routes (and "/") go to the ticket list; logged-out users end up on /login from there */}
      <Route path="*" element={<Navigate to="/tickets" replace />} />
    </Routes>
  )
}

export default App
