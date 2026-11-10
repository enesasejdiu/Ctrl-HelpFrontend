// NotFoundPage.jsx – what a URL that matches no route shows (App.jsx's last route, so it never hides a real one).
// Logged in: inside the normal layout, so the top bar still works. Logged out: in a small public frame, without
// sending the visitor to /login first (logging in only to read "not found" helps nobody).
// A user who still has a temporary password goes to /set-password instead, as from every other page (ProtectedRoute).
// Each one is reported to error monitoring as a low-severity event, with the path only.
import { useEffect } from 'react'
import { Link, Navigate, useLocation } from 'react-router'
import Layout from '../components/Layout'
import Logo from '../components/Logo'
import NotFound from '../components/NotFound'
import { useAuth } from '../context/auth'
import { logNotFound } from '../errors/logger'
import { t } from '../i18n'

function PublicFrame({ children }) {
  return (
    <div className="public-page">
      <header className="public-page__header">
        <Link to="/login" className="topbar__brand" aria-label={t('notFound.logoLabel')}>
          <Logo />
        </Link>
      </header>
      <main className="public-page__main">{children}</main>
    </div>
  )
}

export default function NotFoundPage() {
  const { user } = useAuth()
  const { pathname } = useLocation()

  useEffect(() => {
    logNotFound(pathname)
  }, [pathname])

  if (user?.must_change_password) return <Navigate to="/set-password" replace />

  return user ? (
    <Layout>
      <NotFound />
    </Layout>
  ) : (
    <PublicFrame>
      <NotFound />
    </PublicFrame>
  )
}
