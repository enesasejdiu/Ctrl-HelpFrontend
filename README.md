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

## Demo logins

These accounts come from the backend's demo data. They all use the password `password123`.

| Role     | Email                        |
| -------- | ---------------------------- |
| Admin    | `admin@ticketflow.local`     |
| IT Staff | `agent1@ticketflow.local`    |
| Employee | `employee1@ticketflow.local` |

## Pages

| Route          | Who can open it | What it does                                                                                    |
| -------------- | --------------- | ----------------------------------------------------------------------------------------------- |
| `/login`       | Everyone        | Sign in, with buttons that fill in the demo accounts                                            |
| `/register`    | Everyone        | Create an employee account                                                                      |
| `/tickets`     | Logged-in users | Ticket list with search and filters; employees see their own tickets, staff see all of them     |
| `/tickets/new` | Logged-in users | Report a problem                                                                                |
| `/tickets/:id` | Logged-in users | Ticket details, comments and history; staff manage the ticket, employees close or reopen theirs |
| `/admin`       | Admins          | Dashboard with statistics, charts and performance tables                                        |
| `/admin/users` | Admins          | Change user roles and activate or deactivate accounts                                           |

Employees can only open their own tickets. Any unknown address redirects to `/tickets`.

## Project structure

```
public/
  favicon.svg            Browser tab icon
src/
  api/
    client.js            Axios instance: adds the token, handles expired sessions, reads error messages
  components/
    AuthShell.jsx        Split-screen frame for the login and register pages
    Badges.jsx           Status, priority and overdue badges
    Layout.jsx           Top bar and navigation around every logged-in page
    Logo.jsx             TicketFlow logo
    PasswordInput.jsx    Password field with a show/hide button
    ProtectedRoute.jsx   Sends logged-out users to /login and checks roles
    Ui.jsx               Avatar, spinner, alert, empty state and page header
  context/
    auth.js              Auth context object and the useAuth() hook
    AuthContext.jsx      Holds the logged-in user; login, register and logout
  pages/
    AdminDashboard.jsx   Statistics, charts and tables at /admin
    Login.jsx            Sign-in page
    NewTicket.jsx        New ticket form
    Register.jsx         Sign-up page
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
