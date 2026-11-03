// App.jsx – all routes of TicketFlow.
// Public: /login, /register. Everything else needs a login and renders inside <Layout>; /admin/* is admin-only.
import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import ComingSoon from './pages/ComingSoon'
import Login from './pages/Login'
import Register from './pages/Register'
import TicketList from './pages/TicketList'

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route path="/tickets" element={<TicketList />} />
          <Route path="/tickets/new" element={<ComingSoon title="New ticket" />} />
          <Route path="/tickets/:id" element={<ComingSoon title="Ticket details" />} />

          <Route element={<ProtectedRoute roles={['admin']} />}>
            <Route path="/admin" element={<ComingSoon title="Dashboard" />} />
            <Route path="/admin/users" element={<ComingSoon title="Users" />} />
          </Route>
        </Route>
      </Route>

      {/* Unknown routes (and "/") go to the ticket list; logged-out users end up on /login from there */}
      <Route path="*" element={<Navigate to="/tickets" replace />} />
    </Routes>
  )
}

export default App
