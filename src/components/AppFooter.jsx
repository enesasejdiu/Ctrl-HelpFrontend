// AppFooter.jsx – the small footer under the app's pages: the year and the Privacy link. Used by Layout (every page
// after sign-in), AuthShell (the sign-in pages) and the Privacy page itself.
import { Link } from 'react-router'

// Read once when the app loads, like AuthShell's
const YEAR = new Date().getFullYear()

export default function AppFooter({ className = '' }) {
  return (
    <footer className={`app-footer ${className}`.trim()}>
      <span>© {YEAR} TicketFlow</span>
      <Link to="/privacy">Privacy</Link>
    </footer>
  )
}
