# TicketFlow – Frontend

TicketFlow is an IT helpdesk system. Employees report problems as tickets, IT staff work on them, and admins
manage users and follow the statistics.

This repository is the React web app. The API and database are in a separate repository:
[Ctrl-HelpBackend](https://github.com/enesasejdiu/Ctrl-HelpBackend).

## Tech stack

- [React](https://react.dev/) (JavaScript / JSX)
- [Vite](https://vite.dev/) – dev server and build tool
- [React Router](https://reactrouter.com/) – client-side routing
- [Axios](https://axios-http.com/) – HTTP client for the backend API
- [Recharts](https://recharts.org/) – dashboard charts
- [Lucide](https://lucide.dev/) – icons
- [oxlint](https://oxc.rs/docs/guide/usage/linter) – linter

## Setup

Requirements: Node.js 20+ and npm.

**1. Start the backend first.** Follow the setup in the
[backend README](https://github.com/enesasejdiu/Ctrl-HelpBackend#readme). It must be running on
http://localhost:5050; check it with http://localhost:5050/api/health.

**2. Start the frontend:**

```bash
npm install
cp .env.example .env
npm run dev
```

The app runs at http://localhost:5173.

### Environment variables

| Variable       | Description                 | Value for local development |
| -------------- | --------------------------- | --------------------------- |
| `VITE_API_URL` | Base URL of the backend API | `http://localhost:5050/api` |

### Scripts

| Command                 | Description                           |
| ----------------------- | ------------------------------------- |
| `npm run dev`           | Start the dev server                  |
| `npm run build`         | Build for production (`dist/`)        |
| `npm run preview`       | Preview the production build          |
| `npm run lint`          | Lint the code with oxlint             |
| `npm test`              | Run the unit and component tests once |
| `npm run test:watch`    | Re-run the tests on every file change |
| `npm run test:coverage` | Run the tests with a coverage report  |
| `npm run e2e`           | Run the end-to-end tests (Playwright) on a throwaway database |
| `npm run e2e:cleanup`   | Drop any `ticketflow_e2e_*` database a crashed run left behind |

### Running tests

```bash
npm test               # run all unit and component tests once
npm run test:watch     # re-run them on every file change
npm run test:coverage  # also print a coverage table (HTML report in coverage/)
```

The tests use Vitest and React Testing Library and live next to the code they test (`*.test.jsx` in `src/`). API calls
are answered by MSW (Mock Service Worker) with fake data, so the tests **never call the real backend** and don't
need it running. Shared helpers are in `src/test/` (`renderWithProviders` in `render.jsx`, MSW handlers in
`server.js`, test data in `factories.js`).

### End-to-end tests

```bash
npm run e2e            # Chromium and Firefox, against the real backend
npx playwright test e2e/hr-flow.spec.ts --project=chromium   # one file, one browser
```

**e2e tests use a throwaway database; the real one is never touched.** Each run:

1. creates a new database named `ticketflow_e2e_<timestamp>_<pid>` and fills it with the backend's own
   `db:migrate` and `db:seed --force`
2. starts its own backend and frontend on free ports (never 5050 or 5173), and never reuses a server that is
   already running, so a dev server can't be picked up by mistake
3. drops the database at the end, also when tests fail (`e2e/global-teardown.ts`)

Every step refuses to run unless the database name starts with `ticketflow_e2e_`. The database server is the one in
the backend's `.env` (for example MariaDB from XAMPP); only the name is different. Set `E2E_DB_HOST`, `E2E_DB_PORT`,
`E2E_DB_USER` and `E2E_DB_PASSWORD` to use another server, as CI does with MySQL 8.4. The backend must be checked out
next to this folder (`../Ctrl-HelpBackend`), or set `BACKEND_DIR`.

## Demo logins

These accounts come from the backend's demo data. They all use the password `password123`.

| Role     | Email                        |
| -------- | ---------------------------- |
| Admin    | `admin@ticketflow.local`     |
| IT Staff | `agent1@ticketflow.local`    |
| HR       | `hr@ticketflow.local`        |
| Employee | `employee1@ticketflow.local` |

## Pages

| Route          | Who can open it | What it does                                                                                    |
| -------------- | --------------- | ----------------------------------------------------------------------------------------------- |
| `/login`       | Everyone        | Sign in, with buttons that fill in the demo accounts                                            |
| `/change-password` | Logged-in users | Change your own password (key button in the top bar) |
| `/set-password` | Users with a temporary password | Choose your own password after the first login (or a reset); every other page redirects here until it's done |
| `/tickets`     | Logged-in users | Ticket list with search and filters; employees see their own tickets, staff see all of them     |
| `/tickets/new` | Logged-in users | Report a problem                                                                                |
| `/tickets/:id` | Logged-in users | Ticket details, comments and history; staff manage the ticket, employees close or reopen theirs |
| `/admin`       | Admins          | Dashboard with statistics, charts and performance tables                                        |
| `/admin/users` | Admins and HR   | Add and edit users, reset passwords (a temporary password is shown once), change roles, activate or deactivate accounts; HR: employees only |

Employees can only open their own tickets. Any unknown address redirects to `/tickets`.

## Project structure

```
public/
  favicon.svg            Browser tab icon
src/
  api/
    client.js            Axios instance: adds the token, handles expired sessions, reads error messages
  components/
    AuthShell.jsx        Split-screen frame for the login page
    Badges.jsx           Status, priority and overdue badges
    Layout.jsx           Top bar and navigation around every logged-in page
    Logo.jsx             TicketFlow logo
    Modal.jsx            Dialog shell: focus trap, Escape to close, focus returns to the opener
    PasswordInput.jsx    Password field with a show/hide button
    ProtectedRoute.jsx   Sends logged-out users to /login, temporary passwords to /set-password, and checks roles
    ResetPasswordDialog.jsx  Asks before resetting a user's password
    TemporaryPasswordDialog.jsx  Shows a new temporary password once, with Copy and a warning
    Ui.jsx               Avatar, spinner, alert, empty state and page header
    UserDialog.jsx       "Add user" and "Edit user" form on the Users page
  context/
    auth.js              Auth context object and the useAuth() hook
    AuthContext.jsx      Holds the logged-in user; login, change password and logout
  pages/
    AdminDashboard.jsx   Statistics, charts and tables at /admin
    ChangePassword.jsx   Change your own password (from the top bar)
    Login.jsx            Sign-in page
    NewTicket.jsx        New ticket form
    SetPassword.jsx      "Set your password" after logging in with a temporary password
    TicketDetail.jsx     One ticket: comments, management boxes, info and history
    TicketList.jsx       Ticket list with filters
    Users.jsx            User management at /admin/users
  utils/
    format.js            Status and role labels, dates, durations and initials
  App.jsx                All routes
  index.css              All styles: design tokens, components and responsive rules
  main.jsx               Entry point: mounts the app with routing and login state
index.html               HTML page that loads the app
vite.config.js           Vite configuration
.env.example             Example environment file
.oxlintrc.json           Linter rules
TASKS.md                 Project task list
```

## Team

- **Enesa Sejdiu:** backend (all phases), login and register, layout, ticket list, new ticket, ticket detail, final clean-up
- **Aulona:** admin dashboard, user management
