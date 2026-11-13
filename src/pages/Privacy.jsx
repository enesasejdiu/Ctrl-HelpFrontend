// Privacy.jsx – /privacy: what personal data TicketFlow keeps, why, who can see it and for how long, in plain language.
// Open to everyone, logged in or not (linked from the login page and from the footer of every page). Parts that only
// the company running TicketFlow can fill in are marked with <ToComplete /> so they stand out until someone does.
import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router'
import AppFooter from '../components/AppFooter'
import Logo from '../components/Logo'
import { useAuth } from '../context/auth'

// A part the company running TicketFlow has to write; shown highlighted so it's never mistaken for a real answer
function ToComplete({ children }) {
  return <span className="privacy__todo">[to be completed by your company{children ? `: ${children}` : ''}]</span>
}

const DATA = [
  ['Your account', 'Your name, work email, department, job title and role (employee, IT staff, HR or admin).'],
  ['Your tickets', 'What you report: the title, the description, the category and priority, and its history.'],
  ['Comments', 'What you and IT staff write on a ticket. IT staff can also add internal notes.'],
  ['Attachments', 'Files you add to a ticket, such as screenshots or documents.'],
  ['Ratings', 'The stars and comment you give a closed ticket, once your company has turned ratings on.'],
  [
    'Sign-ins',
    'When you last signed in, failed sign-in attempts (to lock an account after too many), and for each session the ' +
      'time, IP address and browser.',
  ],
  [
    'Audit log',
    'Important actions, such as sign-ins, password changes and account changes, with the time and the IP address ' +
      'they came from.',
  ],
]

const WHY = [
  'To run the helpdesk: so IT can see who reported a problem, reach you about it, and fix it.',
  'To keep accounts safe: sign-in records and the audit log help spot and stop misuse, such as someone guessing a ' +
    'password.',
  'To improve the service: ticket numbers, response times and ratings show where IT can do better.',
]

const WHO = [
  [
    'You',
    'Your own details on your profile, your own tickets with their comments and attachments, and your own ratings. ' +
      'You never see internal notes.',
  ],
  [
    'IT staff',
    'All tickets with their comments, internal notes, attachments and ratings, and the name and department of who ' +
      'reported them.',
  ],
  [
    'HR',
    'The account details of employees (name, email, department, job title, role), to create and manage accounts. For ' +
      'tickets, HR is like any employee: only their own.',
  ],
  [
    'Admins',
    'Everything above, plus the audit log (sign-ins and IP addresses) and the dashboard, which shows ticket numbers ' +
      'and average ratings per IT staff member.',
  ],
]

const HOW_LONG = [
  ['Sessions', 'Deleted 7 days after they end (when you sign out or the session runs out).'],
  ['Password links', 'Deleted 7 days after they were used or ran out.'],
  ['Tickets, comments, attachments and ratings', 'Kept until an admin removes them.'],
  ['The audit log', 'Kept until an admin removes it.'],
  ['Your account', 'Kept while you work here. When you leave, an admin deactivates it, so you can no longer sign in.'],
]

export default function Privacy() {
  const { user } = useAuth()

  return (
    <div className="privacy">
      <header className="privacy__header">
        <Logo />
        <Link to={user ? '/tickets' : '/login'} className="back-link">
          <ArrowLeft size={16} aria-hidden="true" />
          {user ? 'Back to TicketFlow' : 'Back to sign in'}
        </Link>
      </header>

      <main className="privacy__main">
        <h1>Privacy</h1>
        <p className="privacy__lead">
          TicketFlow is your company&apos;s IT helpdesk. This page explains, in plain language, what personal data it
          keeps about you, why, who can see it and for how long.
        </p>
        <p>
          Responsible for your data: <ToComplete>company name and address</ToComplete>. Data protection contact:{' '}
          <ToComplete>name or email</ToComplete>.
        </p>

        <section aria-labelledby="privacy-what">
          <h2 id="privacy-what">What we store</h2>
          <dl className="privacy__list">
            {DATA.map(([term, text]) => (
              <div key={term}>
                <dt>{term}</dt>
                <dd>{text}</dd>
              </div>
            ))}
          </dl>
          <p>
            TicketFlow doesn&apos;t use advertising or tracking cookies. It only sets the cookies that keep you signed
            in.
          </p>
        </section>

        <section aria-labelledby="privacy-why">
          <h2 id="privacy-why">Why</h2>
          <ul>
            {WHY.map((text) => (
              <li key={text}>{text}</li>
            ))}
          </ul>
          <p>
            Legal basis:{' '}
            <ToComplete>
              for example, your employment contract and the company&apos;s legitimate interest in running IT support
            </ToComplete>
            .
          </p>
        </section>

        <section aria-labelledby="privacy-who">
          <h2 id="privacy-who">Who can see it</h2>
          <dl className="privacy__list">
            {WHO.map(([term, text]) => (
              <div key={term}>
                <dt>{term}</dt>
                <dd>{text}</dd>
              </div>
            ))}
          </dl>
          <p>
            Where the data is stored and who hosts it: <ToComplete>server location and hosting provider</ToComplete>.
          </p>
        </section>

        <section aria-labelledby="privacy-how-long">
          <h2 id="privacy-how-long">How long we keep it</h2>
          <dl className="privacy__list">
            {HOW_LONG.map(([term, text]) => (
              <div key={term}>
                <dt>{term}</dt>
                <dd>{text}</dd>
              </div>
            ))}
          </dl>
          <p>
            Your company&apos;s own rules for how long tickets and the audit log are kept:{' '}
            <ToComplete>retention periods</ToComplete>.
          </p>
        </section>

        <section aria-labelledby="privacy-rights">
          <h2 id="privacy-rights">Seeing or correcting your data</h2>
          <p>
            To see the data TicketFlow keeps about you, or to have it corrected or removed, contact your HR or IT admin.
          </p>
          <p>
            Your other rights, and where to complain:{' '}
            <ToComplete>for example, the data protection authority</ToComplete>.
          </p>
        </section>
      </main>

      <AppFooter />
    </div>
  )
}
