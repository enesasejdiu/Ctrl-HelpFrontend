# TicketFlow Frontend – Tasks

React + Vite web app that talks to the `ticketflow-backend` API. Tick each box when it is done and tested.

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

- [ ] `src/api/client.js`: axios instance with baseURL from `VITE_API_URL`
- [ ] Add the token from localStorage as `Authorization: Bearer <token>` to every request
- [ ] On a 401 response: clear the session and go to `/login`
- [ ] `errorMessage(err)` helper that returns the backend's `message`
- [ ] `src/context/AuthContext.jsx`: user, isStaff, login, register, logout (saved in localStorage)

## Phase 3 – Layout and routing

- [ ] `ProtectedRoute`: redirects to `/login` when logged out; optional `roles` prop
- [ ] `Layout`: top bar with logo, nav links (Tickets, New ticket; Dashboard and Users for admin), user name + role, Log out
- [ ] Routes in `App.jsx`: /login, /register, /tickets, /tickets/new, /tickets/:id, /admin, /admin/users
- [ ] Unknown routes redirect to /tickets

## Phase 4 – Login and register

- [ ] Login page: email, password, error message, link to register
- [ ] Register page: name, email, department, password (min 6), link to login
- [ ] Logged-in users visiting these pages are redirected to /tickets
- [ ] Test with all demo accounts

## Phase 5 – Shared UI

- [ ] `Badges.jsx`: StatusBadge, PriorityBadge, status labels, date formatter
- [ ] Colors per status (Open, Assigned, In Progress, Waiting for User, Resolved, Closed, Reopened)
- [ ] Colors per priority (Low, Medium, High, Critical)
- [ ] Red "Overdue" badge
- [ ] Base styles in `index.css`: cards, buttons, forms, tables, alerts

## Phase 6 – Ticket list

- [ ] Title "My tickets" for employees, "All tickets" for staff
- [ ] "+ New ticket" button
- [ ] Filters: search (debounced), status, priority, category
- [ ] Staff-only filters: assigned to (anyone / me / unassigned), "Overdue only"
- [ ] Table: #, title (link), status, priority, category, requester (staff only), assigned to, created
- [ ] Overdue rows highlighted
- [ ] Empty state "No tickets found."

## Phase 7 – New ticket

- [ ] Form: title, category, priority (default Medium), description
- [ ] Categories and priorities loaded from `GET /meta`
- [ ] After saving, go to the new ticket's page

## Phase 8 – Ticket detail

- [ ] Header: #id, title, status, priority, overdue badges
- [ ] Description and resolution note
- [ ] Comments list; internal notes shown in yellow with an "Internal note" label
- [ ] Add-comment form; "Internal note" checkbox for staff only
- [ ] Info box: requester, assignee, category, created, resolved, target time
- [ ] Staff "Manage" box: status dropdown, resolution note (required before resolving), priority dropdown,
      admin "Assign to" dropdown (from `/users/agents`), agent "Take this ticket" button
- [ ] Employee box "Is your problem fixed?" with Close / Reopen buttons when allowed
- [ ] History list: who changed what, from → to, when
- [ ] Page reloads its data after every action

## Phase 9 – Admin dashboard

- [ ] Stat cards: total tickets, still open, overdue (red), average resolution time
- [ ] Bar chart: tickets by status
- [ ] Horizontal bar chart: most common categories
- [ ] Line chart: created vs resolved per week
- [ ] Table: agent performance (assigned, resolved, average time)
- [ ] Table: resolution time by priority (average shown red when above target)

## Phase 10 – User management (admin)

- [ ] Table: name, email, department, role, status
- [ ] Role dropdown (Employee / IT Staff / Admin)
- [ ] Activate / Deactivate button
- [ ] The admin's own row can't be changed

## Phase 11 – Finish

- [ ] Responsive: works on a phone-sized screen
- [ ] Loading and error messages on every page
- [ ] Test each role from start to finish (employee creates → admin assigns → agent resolves → employee closes)
- [ ] README: setup steps, demo logins, pages table
- [ ] Comments in the code explaining the important parts
- [ ] Final commit and push
