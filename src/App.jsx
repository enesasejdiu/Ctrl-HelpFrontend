// App.jsx – all routes of TicketFlow.
// Public: /login, /forgot-password, and /set-password?token=... (a one-time link emailed for a new account or a reset). Everything else
// needs a login; /change-password has its own full-page frame, the rest renders inside <Layout>. /admin and /admin/audit are
// admin-only; /admin/users and /admin/departments are for admins and HR. The knowledge base (/kb…) is for everyone;
// /kb/manage, /kb/new and /kb/:slug/edit for staff.
// A URL that matches no route shows "Page not found" (NotFoundPage), logged in or not; real routes keep their guards.
// Development builds also have /__crash pages for trying the error screens (see pages/DevCrash.jsx).
import { Suspense, lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import { Spinner } from './components/Ui'
import ChangePassword from './pages/ChangePassword'
import DevCrash from './pages/DevCrash'
import ForgotPassword from './pages/ForgotPassword'
import Departments from './pages/Departments'
import SetPassword from './pages/SetPassword'
import SetPasswordWithLink from './pages/SetPasswordWithLink'
import Login from './pages/Login'
import NewTicket from './pages/NewTicket'
import NotFoundPage from './pages/NotFoundPage'
import Privacy from './pages/Privacy'
import Profile from './pages/Profile'
import Settings from './pages/Settings'
import TicketDetail from './pages/TicketDetail'
import TicketList from './pages/TicketList'
import Users from './pages/Users'
import AuditLog from './pages/AuditLog'
import { useLinkTokenFromUrl } from './utils/linkToken'

// The dashboard pulls in the chart library, so it's only downloaded when an admin opens it
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'))

// The knowledge base (the Markdown renderer and sanitizer come with it), downloaded when it's first opened
const KbHome = lazy(() => import('./pages/kb/KbHome'))
const KbCategory = lazy(() => import('./pages/kb/KbCategory'))
const KbSearch = lazy(() => import('./pages/kb/KbSearch'))
const KbArticle = lazy(() => import('./pages/kb/KbArticle'))
const KbManage = lazy(() => import('./pages/kb/KbManage'))
const KbEditor = lazy(() => import('./pages/kb/KbEditor'))
const CannedResponses = lazy(() => import('./pages/CannedResponses'))

// A lazily loaded page, with a spinner until its code has arrived
const page = (Page) => (
  <Suspense fallback={<Spinner label="Loading…" />}>
    <Page />
  </Suspense>
)

// /set-password is two pages. With ?token= it is the public page for an emailed set-password link; without, the
// logged-in page for a temporary password (inside the Layout, like the other pages), whose child route is below.
function SetPasswordRoute() {
  // The emailed link's one-time token (not a login token: it only lets this person set a password). It is read once
  // and taken out of the address bar right away (utils/linkToken.js); the page keeps it in memory only.
  const linkToken = useLinkTokenFromUrl()
  if (linkToken) return <SetPasswordWithLink linkToken={linkToken} />
  return (
    <ProtectedRoute>
      <Layout />
    </ProtectedRoute>
  )
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      {/* Open to everyone, logged in or not */}
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/set-password" element={<SetPasswordRoute />}>
        {/* After logging in with a temporary password, the only page until a new one is chosen */}
        <Route index element={<SetPassword />} />
      </Route>
      {/* Dev only: outside the Layout, so only the full-page fallback catches it */}
      {import.meta.env.DEV && <Route path="/__crash/app" element={<DevCrash kind="app" />} />}

      {/* Routes without a path are wrappers: login check first, then the Layout around each page */}
      <Route element={<ProtectedRoute />}>
        {/* Outside the Layout: a user with a temporary password can't use the pages its menu links to */}
        <Route path="/change-password" element={<ChangePassword />} />

        <Route element={<Layout />}>
          <Route path="/tickets" element={<TicketList />} />
          <Route path="/tickets/new" element={<NewTicket />} />
          <Route path="/tickets/:id" element={<TicketDetail />} />
          <Route path="/profile" element={<Profile />} />

          {/* Knowledge base: everyone reads; staff (agents and admins) write. Fixed paths outrank /kb/:slug, and the
              backend never gives an article the slug "new", "manage" or "search" */}
          <Route path="/kb" element={page(KbHome)} />
          <Route path="/kb/search" element={page(KbSearch)} />
          <Route path="/kb/c/:categorySlug" element={page(KbCategory)} />
          <Route path="/kb/:slug" element={page(KbArticle)} />
          <Route element={<ProtectedRoute roles={['admin', 'agent']} />}>
            <Route path="/kb/manage" element={page(KbManage)} />
            <Route path="/settings/canned-responses" element={page(CannedResponses)} />
            <Route path="/kb/new" element={page(KbEditor)} />
            <Route path="/kb/:slug/edit" element={page(KbEditor)} />
          </Route>

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
            <Route path="/admin/audit" element={<AuditLog />} />
            <Route path="/admin/settings" element={<Settings />} />
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
