# TicketFlow Frontend – Tasks

React + Vite web app that talks to the `ticketflow-backend` API. Tick each box when it is done and tested.

## Team split

| Area              | Teammate                                                      | Aulona                                                                                 |
| ----------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| **Code**          | Phase 7: New ticket page                                      | Phase 9: Admin dashboard (stat cards + charts)                                         |
|                   | Phase 8: Ticket detail (comments, status, assign, history)    | Phase 10: User management page                                                         |
|                   | Phase 11: Final testing, responsive fixes, merging everything | Help with Phase 11 testing (each role, start to finish)                                |
| **Documentation** | README checks, Postman collection demo                        | **Project report**: problem, goals, ERD diagram, architecture, screenshots, conclusion |
| **Presentation**  | Live demo: employee → agent → admin flow                      | Slides: problem, solution, tech stack, database design, statistics                     |
| **Learning**      | Explain the dashboard + users pages                           | Explain the backend (auth, tickets, roles)                                             |

**Why this works:**

- **Same amount of work:** Phase 8 is the biggest page, so the teammate takes that; Aulona gets two pages plus the report.
- **No conflicts:** the teammate's files (`NewTicket.jsx`, `TicketDetail.jsx`) and Aulona's (`AdminDashboard.jsx`, `Users.jsx`) are separate. Both pages are already placeholders in `App.jsx`.
- **The "Learning" row matters:** evaluators often ask either person about any part. Spend 30 minutes walking each other through your code before the presentation.

## Phase 1 – Project setup

Note: created with create-vite 9.3 (React 19, Vite 8, React Router 7, Recharts 3, oxlint). Demo assets removed; favicon.svg kept.

- [x] Create the app with Vite (React template)
- [x] Install: `react-router-dom axios recharts`
- [x] Create `.env.example` with `VITE_API_URL=http://localhost:5050/api`
- [x] Check `.gitignore` (node_modules, dist, .env)
- [x] Remove the Vite demo content
- [x] Create folders: `src/api/`, `src/context/`, `src/components/`, `src/pages/`
- [x] Wrap the app in `BrowserRouter` in `main.jsx`

## Phase 2 – API and login state

- [x] `src/api/client.js`: axios instance with baseURL from `VITE_API_URL`
- [x] Add the token from localStorage as `Authorization: Bearer <token>` to every request
- [x] On a 401 response: clear the session and go to `/login`
- [x] `errorMessage(err)` helper that returns the backend's `message`
- [x] `src/context/AuthContext.jsx`: user, isStaff, login, register, logout (saved in localStorage)

## Phase 3 – Layout and routing

- [x] `ProtectedRoute`: redirects to `/login` when logged out; optional `roles` prop
- [x] `Layout`: top bar with logo, nav links (Tickets, New ticket; Dashboard and Users for admin), user name + role, Log out
- [x] Routes in `App.jsx`: /login, /register, /tickets, /tickets/new, /tickets/:id, /admin, /admin/users
- [x] Unknown routes redirect to /tickets

## Phase 4 – Login and register

- [x] Login page: email, password, error message, link to register
- [x] ~~Register page~~: removed in v1.0. Admins and HR create accounts
- [x] Logged-in users visiting these pages are redirected to /tickets
- [x] Test with all demo accounts

## Phase 5 – Shared UI

Note: status labels and the date formatter live in `src/utils/format.js` (Badges.jsx only exports components, so fast refresh keeps working).

- [x] `Badges.jsx`: StatusBadge, PriorityBadge, status labels, date formatter
- [x] Colors per status (Open, Assigned, In Progress, Waiting for User, Resolved, Closed, Reopened)
- [x] Colors per priority (Low, Medium, High, Critical)
- [x] Red "Overdue" badge
- [x] Base styles in `index.css`: cards, buttons, forms, tables, alerts

## Phase 6 – Ticket list

- [x] Title "My tickets" for employees, "All tickets" for staff
- [x] "+ New ticket" button
- [x] Filters: search (debounced), status, priority, category
- [x] Staff-only filters: assigned to (anyone / me / unassigned), "Overdue only"
- [x] Table: #, title (link), status, priority, category, requester (staff only), assigned to, created
- [x] Overdue rows highlighted
- [x] Empty state "No tickets found."

## Phase 7 – New ticket

- [x] Form: title, category, priority (default Medium), description
- [x] Categories and priorities loaded from `GET /meta`
- [x] After saving, go to the new ticket's page

## Phase 8 – Ticket detail

- [x] Header: #id, title, status, priority, overdue badges
- [x] Description and resolution note
- [x] Comments list; internal notes shown in yellow with an "Internal note" label
- [x] Add-comment form; "Internal note" checkbox for staff only
- [x] Info box: requester, assignee, category, created, resolved, target time
- [x] Staff "Manage" box: status dropdown, resolution note (required before resolving), priority dropdown,
      admin "Assign to" dropdown (from `/users/agents`), agent "Take this ticket" button
- [x] Employee box "Is your problem fixed?" with Close / Reopen buttons when allowed
- [x] History list: who changed what, from → to, when
- [x] Page reloads its data after every action

## Phase 9 – Admin dashboard

- [x] Stat cards: total tickets, still open, overdue (red), average resolution time
- [x] Bar chart: tickets by status
- [x] Horizontal bar chart: most common categories
- [x] Line chart: created vs resolved per week
- [x] Table: agent performance (assigned, resolved, average time)
- [x] Table: resolution time by priority (average shown red when above target)

## Phase 10 – User management (admin)

- [x] Table: name, email, department, role, status
- [x] Role dropdown (Employee / IT Staff / Admin)
- [x] Activate / Deactivate button
- [x] The admin's own row can't be changed

## Phase 11 – Finish

- [x] Responsive: works on a phone-sized screen
- [x] Loading and error messages on every page
- [x] Test each role from start to finish (employee creates → admin assigns → agent resolves → employee closes)
- [x] README: setup steps, demo logins, pages table
- [x] Comments in the code explaining the important parts
- [x] Final commit and push

## v1.0

- [x] Vitest + React Testing Library (MSW for API mocking)
- [x] Component tests: Login, TicketList, NewTicket, Badges, ProtectedRoute
- [x] Self-registration removed: no /register page or sign-up link (the backend endpoint is gone)
- [x] Users page: Add user form (admin and HR). Job title comes later.
- [x] Edit-user form and Reset password button
- [x] Temporary password shown once after creating or resetting
- [x] Forced password change after a temporary password, and Change password in the top bar
- [x] Department picker in the Add/Edit user dialog (department_id); Users table shows the department name
- [x] Set your password page after first login, blocking everything else
- [x] Profile page: own details and Change password
- [x] Departments page (Admin, HR)
- [x] Job title in the Add/Edit user forms and the Users list
- [x] Navigation for HR: Tickets (own), New ticket, Users, Departments
- [x] e2e tests use a throwaway database, never the real one
- [x] Component and Playwright tests: HR adds an employee → employee sets password → creates a ticket (built by Aulona in PR #17; "My tickets" and admin checks added)
- [x] Lockout and rate-limit messages on the login page
- [x] HR navigation checked
- [x] Password delivery from the backend: one-time links (48h, /set-password?token=…, token removed from the URL) for new accounts and resets when email is set up, the temporary password otherwise; Resend link
- [x] "Forgot password" page; e2e run in temporary-password mode
- [x] Audit log page (Admin): filter by user, action and date
- [x] Lockout and session-expired messages on the login page
- [x] Attachments on New ticket and Ticket detail
- [x] Forgot password and Set password from link pages
- [x] "Forgot password" v2: link only when email is set up (`GET /auth/config`), one confirmation for every answer, 429 countdown, 1-hour links that point back to /forgot-password when expired or used
- [x] Pagination on the ticket list and users page
- [x] Settings page (Admin): categories, priorities and target hours, company name in the top bar
- [x] Satisfaction rating (1–5 stars) when the employee closes a ticket
- [x] Log out everywhere button on the profile page
- [x] Privacy page in the app
- [x] Frontend Dockerfile and nginx config
