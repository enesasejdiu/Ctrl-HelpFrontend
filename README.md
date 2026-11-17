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
- [Sentry](https://sentry.io/) – error monitoring (optional, only with a DSN)
- [Lucide](https://lucide.dev/) – icons
- [oxlint](https://oxc.rs/docs/guide/usage/linter) – linter

## Setup

Requirements: Node.js 22.22 or newer (React Router 8 needs it; `.nvmrc` has the version CI uses) and npm.

**1. Start the backend first.** Follow the setup in the
[backend README](https://github.com/enesasejdiu/Ctrl-HelpBackend#readme). It must be running on
http://localhost:5050; check it with http://localhost:5050/api/health.

**2. Start the frontend:**

```bash
npm install
cp .env.example .env
npm run dev
```

The app runs at http://localhost:5173. The dev server forwards `/api` to the backend (see [Sessions](#sessions-cookies-and-csrf)).

### Environment variables

| Variable           | Description                                                                      | Value for local development |
| ------------------ | -------------------------------------------------------------------------------- | --------------------------- |
| `VITE_API_URL`     | Base URL of the backend API, as the browser calls it                             | `/api`                      |
| `API_PROXY_TARGET` | Where the dev (and preview) server's `/api` proxy forwards to. Not in the bundle | `http://localhost:5050`     |

An older `.env` with `VITE_API_URL=http://localhost:5050/api` still works locally (the cookies are for `localhost`
on any port), but switch to `/api`: it is the setup that also works once the app and API have real host names.

### Sessions: cookies and CSRF

The frontend never sees or stores the login token.

- **Login** (`POST /api/auth/login`): the backend sets two cookies. `tf_session` holds the JWT and is httpOnly, so no
  script on the page can read it. `tf_csrf` is readable. The app keeps only the returned `user` (in memory) and
  ignores the `token` the response still contains for older clients.
- **Every request** goes through the axios client in `src/api/client.js` with `withCredentials: true`, so the browser
  attaches the cookies. There is no `Authorization` header.
- **CSRF (double-submit cookie):** POST, PATCH, PUT and DELETE send the `tf_csrf` cookie's value as `X-CSRF-Token`
  (the backend answers 403 `CSRF_INVALID` without it). The cookies are also `SameSite=Lax`.
- **On startup** the app asks `GET /api/auth/me` who is logged in and shows "Checking your session…" until it
  answers: 200 means logged in, 401 means the login page. Nothing is read from storage. A token left in
  `localStorage` by an older version (`ticketflow.token`, `ticketflow.user`) is deleted once, silently
  (`src/context/legacySession.js`, to be removed after a release or two).
- **401** on any request (the session expired, the account was deactivated) forgets the user and opens
  `/login?reason=session_expired`. The login page says "Your session has ended. Please sign in again.", takes the
  reason out of the URL (so a reload doesn't repeat it), and after signing in returns to the page you were on. That
  page travels in the router state, not the URL, and only a path on this site is accepted
  (`src/utils/returnPath.js`). Logging out yourself, or opening the app without a session, shows no message.
  **403 `PASSWORD_CHANGE_REQUIRED`** opens `/set-password`.
- **Logout** calls `POST /api/auth/logout` (the backend clears the cookies) and forgets the user, even if that
  request fails.
- There is no token refresh: a session lasts 8 hours, then you log in again.

**Same origin.** The page must be able to read `tf_csrf`, and a page can only read cookies of its own host. So the
browser should reach the API on the page's own origin. In development the Vite dev server proxies `/api` to
`API_PROXY_TARGET`. In production, serve the API under the same origin as well (for example a reverse proxy that
sends `/api` to the backend) and build with `VITE_API_URL=/api`; the backend sets `Secure` cookies there, so it
needs HTTPS.

`src/test/no-token-storage.test.js` fails if any app code uses `localStorage`/`sessionStorage` (apart from the
cleanup above), sets an `Authorization` header, or reads a token.

### Login messages

One notice at a time above the login form, the latest event winning:

| Backend answer                        | Message                                                                                                                               | Button                                                                   |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 401                                   | Wrong email or password (never says whether the email exists)                                                                         | enabled                                                                  |
| 423 `ACCOUNT_LOCKED`                  | Too many failed attempts. Your account is locked. Try again in {time}. Plus a note that an administrator or HR can reset the password | disabled for that email until the time is up; another email gets it back |
| 429 `RATE_LIMITED` with `Retry-After` | Too many attempts. Please wait {time} and try again.                                                                                  | disabled until the time is up                                            |
| 429 without `Retry-After`             | Too many attempts. Please wait a few minutes and try again.                                                                           | enabled                                                                  |
| no answer, or 5xx                     | Couldn't reach the server. Please try again.                                                                                          | enabled                                                                  |

{time} counts down from an end time (taken from `Retry-After`, or the 423 body's `retryAfterMinutes`): "about N
minutes" above 5 minutes, then m:ss. When it reaches zero the button comes back with "You can try signing in again
now.". Errors use `role="alert"`; the session-expired and "try again now" notices use `role="status"`.

All of these texts live in `src/i18n/en.js` and are read with `t()` from `src/i18n`.

### When something crashes

A component that throws while rendering shows a "Something went wrong" screen instead of a blank page (`src/errors/`):

- **A page crashes**: the page area shows the error (`RouteErrorBoundary`, inside `Layout`); the top bar keeps working.
  Any navigation clears it.
- **Anything else crashes** (a layout, the login page, the router itself): a full-page error. Its buttons use full page
  loads, since the router may be what broke. Two boundaries share that screen (`PageErrorBoundary`): one inside the
  router's root route (`src/router.jsx`), and `AppErrorBoundary` outermost in `main.jsx`.
- **Why one sits inside the router:** the app uses a data router (`createBrowserRouter`), and React Router puts its own
  error boundary around the root route. Its default "Unexpected Application Error!" page would win, so the root route's
  element starts with `PageErrorBoundary`, and its `ErrorBoundary` (`RethrowRouteError`) passes on anything that still
  gets through. A new top-level route in `router.jsx` needs the same; pages added in `App.jsx` need nothing.
- Both offer **Try again** and **Go to home page**, plus **Reload page** on the full-page one, and show an 8-character
  **error reference** to give to support. Development builds also show the message and stacks in a collapsible
  section; production never does.
- Every crash is logged once by `logError()` in `src/errors/logger.js`, with the error, component stack, route path
  (no query string) and user id. It always goes to `console.error`, and to **Sentry** when `VITE_SENTRY_DSN` is set at
  build time (`src/errors/monitoring.js`).
- **The reference** on screen is the first 8 characters of the Sentry event ID. The ID is made when the error happens,
  so it shows at once, and the event is sent to Sentry under it. To find a reference like `3FA91C0B` in Sentry, search
  for `reference:3FA91C0B` (a tag on every event).
- **Sentry setup:** set `VITE_SENTRY_DSN`, plus optionally `VITE_SENTRY_ENVIRONMENT` and `VITE_SENTRY_RELEASE` (see
  `.env.example`). Without a DSN, Sentry isn't downloaded at all. With one, it loads in the background after the app
  starts, and reports from before that are queued.
- **What Sentry receives:** only what `logError()` sends, plus the user's id (no email or name). Default PII is off, and
  there are no breadcrumbs, request headers, cookies, session replay or tracing. Query strings are stripped from URLs.
  e2e runs never report (`playwright.config.ts` empties the DSN).
- Uncaught errors and unhandled promise rejections (e.g. in event handlers) are logged the same way, but don't replace
  the page.
- **After a deploy**, an open tab can ask for code files that no longer exist. That error reloads the page once. If it
  happens again within 5 minutes, the error screen is shown instead, so it can't loop. A timestamp in sessionStorage
  (`ticketflow.chunkReloadAt`) is all that's stored.

To try it, development builds have `/__crash` (a page crash), `/__crash/chunk` (a failed code download) and
`/__crash/app` (a full-page crash). Production builds don't include them. `e2e/error-pages.spec.ts` checks all three
in real browsers.

### Scripts

| Command                           | Description                                                                                             |
| --------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `npm run dev`                     | Start the dev server                                                                                    |
| `npm run build`                   | Build for production (`dist/`)                                                                          |
| `npm run preview`                 | Preview the production build                                                                            |
| `npm run lint`                    | Lint the code with oxlint                                                                               |
| `npm test`                        | Run the unit and component tests once                                                                   |
| `npm run test:watch`              | Re-run the tests on every file change                                                                   |
| `npm run test:coverage`           | Run the tests with a coverage report                                                                    |
| `npm run e2e`                     | Run the end-to-end tests (Playwright) on a throwaway database                                           |
| `npm run e2e:temporary-passwords` | The e2e tests for the backend without email (temporary passwords), on a throwaway database of their own |
| `npm run e2e:cleanup`             | Drop any `ticketflow_e2e_*` database a crashed run left behind                                          |

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

The e2e backend runs with email set up, so new and reset passwords go out as links. No email ever leaves the machine: it runs with `NODE_ENV=test` and saves every email it "sends" as a
`.json` file in a folder of its own (`MAIL_OUTBOX_DIR`, in the system temp folder, removed with the database).
Tests read new accounts' set-password links from there (`e2e/support/mail.ts`).

The backend can also run without email (temporary passwords). `npm run e2e:temporary-passwords` starts a separate run
in that mode, with only `e2e/temporary-passwords.spec.ts` (the normal run skips that file); CI runs it after the main
suite, in Chromium.

Every step refuses to run unless the database name starts with `ticketflow_e2e_`. The database server is the one in
the backend's `.env` (for example MariaDB from XAMPP); only the name is different. Set `E2E_DB_HOST`, `E2E_DB_PORT`,
`E2E_DB_USER` and `E2E_DB_PASSWORD` to use another server, as CI does with MySQL 8.4. The backend must be checked out
next to this folder (`../Ctrl-HelpBackend`), or set `BACKEND_DIR`.

### End-to-end tests against staging

`npm run e2e:staging` (`playwright.staging.config.ts`) runs the suite against the shared staging server. It starts
no servers and never touches a database. The tests use the deployed app and make their own data through its API.

```bash
# PowerShell: $env:STAGING_URL='https://…'; bash: export STAGING_URL=https://…  (never commit these)
STAGING_URL=https://<staging host> STAGING_ADMIN_EMAIL=… STAGING_ADMIN_PASSWORD=… npm run e2e:staging
```

**Safety.** The run stops before its first request unless all of these hold:

- `STAGING_URL` is `https://` and its host is listed in [`e2e/staging-hosts.json`](e2e/staging-hosts.json) (change
  that list through a pull request);
- the host doesn't look like production (`prod`, `production`, `live`, `www` in its name);
- the staging admin's login is in the environment.

`localhost` is always allowed, for a rehearsal: CI's "staging rehearsal" job runs it against a local stand-in.
Passwords are never printed.

**What it does:**

- **Gentle on the server:** one worker, Chromium only. The lockout and login limits count per IP address, for
  everyone behind it.
- **Failures stay visible:** no retries, so flaky tests show up. Traces, screenshots and video are kept for each
  failure, in `playwright-report-staging/` and `test-results/staging/`.
- **Its own accounts:** the global setup (`e2e/global-setup.staging.ts`) creates `e2e-<runId>-employee@example.test`
  and an agent through the API. Every test's names and emails start with `e2e-<runId>-` and use the reserved
  `.test` domain, so no email reaches anyone. Categories and priorities are looked up by name.
- **Cleanup afterwards** (`e2e/global-teardown.staging.ts`, also when tests fail): attachments are deleted, tickets
  closed and accounts deactivated. Tickets and accounts can't be deleted through the API, so they stay, closed and
  deactivated, with the prefix. The result is in `test-results/staging-cleanup.json`.
- **Needs email off on staging.** The run's accounts get their password the temporary-password way. With email on,
  their set-password links go to an inbox this run can't read, and the setup stops with a message saying so.
- **Local-only tests are excluded.** Files that only work against a local run are listed in
  `playwright.staging.config.ts` (`LOCAL_ONLY`, with the reason for each) and marked `@local-only` at their top.

### Dependency updates and security audit

- **Dependabot** (`.github/dependabot.yml`) opens update PRs every Monday at 06:00 (Europe/Budapest), labelled
  `dependencies` plus `frontend` or `ci`. Minor and patch updates are grouped into one PR for production
  dependencies and one for dev dependencies. Each major update gets its own PR, because it needs a review. GitHub
  Actions versions are kept up to date the same way.
- **Security audit** (`.github/workflows/security.yml`) runs on every PR, on pushes to `main`, every Monday, and by
  hand:
  - It fails when `npm audit --omit=dev --audit-level=high` finds a high or critical vulnerability in a production
    dependency.
  - The full audit (dev dependencies too) is listed in the job summary and never fails the check.
  - Run the same check locally: `npm audit --omit=dev --audit-level=high`.

## Demo logins

These accounts come from the backend's demo data. They all use the password `password123`.

| Role     | Email                        |
| -------- | ---------------------------- |
| Admin    | `admin@ticketflow.local`     |
| IT Staff | `agent1@ticketflow.local`    |
| HR       | `hr@ticketflow.local`        |
| Employee | `employee1@ticketflow.local` |

## Pages

| Route                   | Who can open it                 | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ----------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/login`                | Everyone                        | Sign in, with buttons that fill in the demo accounts                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `/forgot-password`      | Everyone                        | "Forgot password?" from sign-in (shown only when `GET /api/auth/config` says `email_enabled`): asks the backend to email a one-time reset link (1 hour). The page shows the same confirmation whatever the server did, so it never tells whether an account exists; only a malformed email (422, under the field) and too many requests (429, a countdown from `Retry-After`) look different. The current password keeps working until the link is used                                                                                                       |
| `/change-password`      | Logged-in users                 | Change your own password (key button in the top bar)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `/set-password?token=…` | Everyone (the emailed link)     | A one-time link for a new account or an Admin/HR reset (48 hours), or from "Forgot password" (1 hour, "Choose a new password"), when the backend has email set up. The token is taken out of the address bar at once (not kept in history or sent as a Referer; the page also sets `Referrer-Policy: no-referrer`), the link is checked (expired, used or replaced links say to ask an administrator or HR for a new one; an expired or used "Forgot password" link links back to `/forgot-password`), then sign-in opens with "Password set, please log in." |
| `/set-password`         | Users with a temporary password | Choose your own password after a reset; every other page redirects here until it's done                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `/tickets`              | Logged-in users                 | Ticket list with search and filters; employees see their own tickets, staff see all of them                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `/tickets/new`          | Logged-in users                 | Report a problem                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `/tickets/:id`          | Logged-in users                 | Ticket details, comments and history; staff manage the ticket, employees close or reopen theirs                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `/admin`                | Admins                          | Dashboard with statistics, charts and performance tables                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `/admin/users`          | Admins and HR                   | Add and edit users, reset passwords, change roles, activate or deactivate accounts; HR: employees only. After Add user or a reset, the backend's `password_delivery` decides what you see: `email` → "A link to set the password was emailed to …" (and "Resend link" on rows still waiting), `temporary_password` → the temporary password, shown once                                                                                                                                                                                                       |

Employees can only open their own tickets. `/` opens `/tickets`.

### Page not found

- **An address that matches no route** shows "Page not found" (`src/pages/NotFoundPage.jsx`, the last route in
  `App.jsx`, so it never hides a real one). Logged in, it shows inside the normal layout. Logged out, it shows in a
  small public frame, without sending you to `/login` first. A user who still has a temporary password goes to
  `/set-password`, as from every other page.
- **Real routes keep their guards:** a protected page while logged out still goes to `/login`, and an admin page opened
  by another role still goes back to `/tickets` (the app has no separate "not allowed" page).
- **A record that doesn't exist:** a page shows `<NotFound message="…" />` in place when the API answers 404
  (`isNotFound(err)` in `src/api/client.js`). The ticket page does this ("This ticket doesn't exist or has been
  removed."), and also for an id that isn't a number, without asking the API.
- The page shows the address you asked for, as text and cut to 100 characters, without the query string. It has
  **Go to home page** (the ticket list, or `/login` when logged out), plus **Go back** when the previous page was in
  the app. While it's shown, the tab title is "Page not found – TicketFlow" and a `noindex` meta tag is set.
- Addresses that match no route are reported to Sentry, when it's configured, as "info" events with the path only
  and no user. Missing records aren't reported.
- **Status code:** this is a single-page app, so the server answers every page address with `index.html` and status
  200; only the app knows which addresses exist. Missing _files_ are different: see Hosting.

### Hosting

The server must send `index.html` for every page address (deep links like `/tickets/42`, and reloads). It must send a
real **404** for files that don't exist (`/assets/index-OLD.js`, `/missing.png`), never `index.html`. Otherwise a
code file from an older deploy is read as HTML and fails with a confusing error instead of a clean failed download.

- `npm run preview` follows both rules: `scripts/static-not-found.js` is a Vite plugin that answers 404 for any path
  ending in a file extension that isn't in `dist/`.
- Production needs the same rules. With nginx:

```nginx
root /var/www/ticketflow/dist;

# Built files: serve them, or a real 404. Hashed names never change, so they can be cached for good.
location /assets/ {
    try_files $uri =404;
    add_header Cache-Control "public, max-age=31536000, immutable";
}

# Anything else with a file extension (favicon.svg, robots.txt, …): the file or 404. No hash in these names: 1 hour.
location ~ \.[a-zA-Z0-9]+$ {
    try_files $uri =404;
    add_header Cache-Control "public, max-age=3600";
}

# Page addresses: the app
location / {
    try_files $uri /index.html;
}

# index.html, also for every page address above (try_files ends here, so the header goes here, not in "location /"):
# not cached, so a new deploy is picked up
location = /index.html {
    add_header Cache-Control "no-cache";
}

# The API on the same origin (see "Sessions"). No path after the address: /api is kept, as the backend expects.
location /api/ {
    proxy_pass http://127.0.0.1:5050;
    client_max_body_size 11m;
}
```

### Docker

The [`Dockerfile`](Dockerfile) builds a production image: Vite builds the app in a Node stage (Node 22.22, the
project's version), and the final image is nginx (the unprivileged image: runs as the `nginx` user, uid 101, never
root) serving `dist/` on **port 8080**. Node, the source code, `node_modules` and `.env` files never get into it.
The nginx site is [`docker/default.conf.template`](docker/default.conf.template); it follows the rules under
[Hosting](#hosting):

- every page address gets `index.html` (deep links and reloads work); a missing file is a real 404, never the page
- `/api/` goes to the backend (see below)
- `/assets/*` (hashed names) are cached for a year (`immutable`); `index.html` is `no-cache`, so a deploy shows up
  straight away (the browser revalidates with its ETag; no hard refresh needed); other files from `public/`
  (`favicon.svg`, no hash in the name) for an hour
- gzip for HTML, CSS, JavaScript, JSON, SVG and text
- security headers on every answer ([`docker/security-headers.conf`](docker/security-headers.conf)), see below
- `/healthz` answers `ok` (not logged); access logs go to stdout, errors to stderr (`docker logs`)

```bash
docker build -t ticketflow-web --build-arg VCS_REF=$(git rev-parse HEAD) .
docker run -d --name ticketflow-web -p 8080:8080 -e BACKEND_URL=http://api:5050 ticketflow-web
```

| Setting                                                             | When                  | What it does                                                                                                                   |
| ------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `BACKEND_URL`                                                       | container start       | Where `/api` goes: the backend's address **without a path**. Default `http://api:5050`. `API_URL`, the older name, still works |
| `VITE_API_URL`                                                      | build (`--build-arg`) | How the browser calls the API. Default `/api`; keep it (one origin, see below)                                                 |
| `VITE_SENTRY_DSN`, `VITE_SENTRY_ENVIRONMENT`, `VITE_SENTRY_RELEASE` | build                 | Optional error tracking (README "Error tracking")                                                                              |
| `VCS_REF`                                                           | build                 | The commit, as the `org.opencontainers.image.revision` label                                                                   |

Build arguments end up **in the JavaScript bundle**, so they are public: never put a secret there. `BACKEND_URL` is
read when the container starts, so one image serves every environment.

**How `/api` works.** The browser only ever talks to this container. nginx passes `/api/...` on to `BACKEND_URL`
unchanged (the `/api` prefix is **kept**: the backend's routes are `/api/...`; an unknown one gets the backend's 404
JSON, never `index.html`), with `Host`, `X-Real-IP`, `X-Forwarded-For`, `X-Forwarded-Proto` and `X-Forwarded-Host`, cookies and the
`X-CSRF-Token` header. So the page and the API share one origin: the session cookies are first-party, no CORS is
needed, and `SameSite` stays as strict as the backend sets it (see [Sessions](#sessions-cookies-and-csrf)).

- The backend must **trust this proxy**, so rate limits and the audit log see the visitor's IP address, not nginx's.
  It does in production (`app.set('trust proxy', 1)` in the backend's `src/app.js`: one proxy). With another proxy
  or load balancer in front of this one, that number has to grow.
- nginx looks `BACKEND_URL` up per request, so it starts even when the API isn't up yet (`/api` answers 502 until it
  is). Use an IP address or a name Docker's DNS knows (a container or service name), not one only in `/etc/hosts`.
- Request bodies up to 11 MB pass; bigger ones get 413 from nginx. Attachments are 10 MB at most and the app uploads
  them one per request; the API checks the real limits. Uploads stream to the API (no temporary file in nginx).
  Timeouts: 5 s to connect, 60 s per request. nginx caches no API answer.
- The app uses no websockets or server-sent events, so there are no upgrade headers.

**Security headers**, on every answer (pages, files, 404s, `/healthz`):

| Header                    | Value                                                                                                                                                                                                                                                                           |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Content-Security-Policy` | `default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' https://*.sentry.io; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'` |
| `X-Content-Type-Options`  | `nosniff`                                                                                                                                                                                                                                                                       |
| `X-Frame-Options`         | `DENY`                                                                                                                                                                                                                                                                          |
| `Referrer-Policy`         | `strict-origin-when-cross-origin`; `no-referrer` on `/set-password` and `/forgot-password`                                                                                                                                                                                      |
| `Permissions-Policy`      | `camera=(), microphone=(), geolocation=()`                                                                                                                                                                                                                                      |

`server_tokens off` keeps the nginx version out of the `Server` header.

**Everything together:** [`docker-compose.example.yml`](docker-compose.example.yml) wires this image, the backend and
MySQL together (`BACKEND_URL=http://api:5050`), with a one-off `migrate` service before the API starts. Copy it
next to both repos, put the secrets it names into a `.env` beside it, and run `docker compose up -d --build`.

- **Health check:** every 30 seconds the container asks itself for `/healthz`; `docker ps` shows `healthy`.
- **HTTPS:** the image speaks plain HTTP on 8080. Put it behind something that terminates TLS (a load balancer or a
  reverse proxy) in production; the backend's cookies are `Secure` there.

**CI** (the `docker` job in `frontend-ci.yml`, every pull request, nothing pushed): hadolint, the build, `nginx -t`,
the image size and labels, then the image runs against a stub backend
([`docker/stub-backend.mjs`](docker/stub-backend.mjs)) and [`docker/verify.sh`](docker/verify.sh) checks it: non-root,
healthy, the routes and their cache headers, gzip, the 404s (files and unknown API routes), every security header, the
`/api` proxy and what it forwards (path, headers, cookies both ways), the upload limit (10 MB passes, 12 MB is 413),
that a changed `index.html` reaches the browser without a hard refresh, and that no source, source map, `.env` or
`node_modules` is in the image.
[`docker/check-csp.mjs`](docker/check-csp.mjs) opens the app in Chromium with the real policy and fails on any
violation. A last step checks that a source-only change reuses the `npm ci` layer.

The `stack` job in `e2e.yml` runs nginx in front of the **real** backend: it starts
[`docker-compose.example.yml`](docker-compose.example.yml) (both images built from source, the backend in production
mode, MySQL, throwaway secrets and database, demo data), and [`docker/verify-stack.sh`](docker/verify-stack.sh)
checks that the backend gets `/api/...` with the prefix, that login, cookies and CSRF work through nginx, that the
audit log records the visitor's IP address (not nginx's, not a made-up `X-Forwarded-For`), and that a 10 MB
attachment is saved while 12 MB gets 413.

## Project structure

```
Dockerfile               Production image: Vite build, then nginx on port 8080 (README "Docker")
docker/
  default.conf.template  The nginx site: SPA routes, /api proxy, caching, gzip
  security-headers.conf  CSP and the other security headers
  backend-url.envsh      Fills in BACKEND_URL (or the older API_URL) when the container starts
  verify.sh              CI's checks of a running container
  stub-backend.mjs       A stand-in backend for those checks
  check-csp.mjs          Opens the app in Chromium and reports CSP violations
docker-compose.example.yml  Frontend + backend + MySQL with Docker Compose
public/
  favicon.svg            Browser tab icon
src/
  api/
    client.js            Axios instance: sends the session cookies and the CSRF header, handles expired sessions, reads error messages
  components/
    AuthShell.jsx        Split-screen frame for the login page
    Badges.jsx           Status, priority and overdue badges
    Layout.jsx           Top bar and navigation around every logged-in page
    Logo.jsx             TicketFlow logo
    NotFound.jsx         "Page not found" content, also used in place of a missing record (`message`)
    Modal.jsx            Dialog shell: focus trap, Escape to close, focus returns to the opener
    PasswordInput.jsx    Password field with a show/hide button
    ProtectedRoute.jsx   Sends logged-out users to /login, temporary passwords to /set-password, and checks roles
    ResetPasswordDialog.jsx  Asks before resetting a user's password
    TemporaryPasswordDialog.jsx  Shows a reset's temporary password once, with Copy and a warning
    Ui.jsx               Avatar, spinner, alert, empty state and page header
    UserDialog.jsx       "Add user" and "Edit user" form on the Users page
  errors/
    AppErrorBoundary.jsx   Outermost boundary (full-page screen); also listens for uncaught errors
    PageErrorBoundary.jsx  The full-page error screen's boundary, used by AppErrorBoundary and router.jsx
    RethrowRouteError.jsx  The root route's ErrorBoundary: hands errors to AppErrorBoundary, not React Router's page
    RouteErrorBoundary.jsx Error screen in place of a crashed page, inside the layout
    ErrorBoundary.jsx      The boundary itself: logs, reloads once on a chunk load error, resets on navigation
    ErrorFallback.jsx      "Something went wrong" screen (no router, auth or API inside)
    GlobalErrorListener.jsx  Logs uncaught errors and unhandled rejections
    chunkReload.js         Recognises chunk load errors; reloads at most once per 5 minutes
    logger.js              logError(): every error report, with its event ID and reference
    monitoring.js          Sentry: loaded only with a DSN, privacy-safe options, scrubs events before sending
    messages.js            The error screens' texts, with English defaults if i18n fails
  context/
    auth.js              Auth context object and the useAuth() hook
    AuthContext.jsx      Holds the logged-in user (in memory; checked with /auth/me on startup); login, change password and logout
    legacySession.js     Deletes the token older versions kept in localStorage (temporary)
  i18n/
    en.js                English messages (login notices and the error screens so far)
    index.js             t() and tNodes(): look up a message, pick the plural, fill in {params}
  pages/
    AdminDashboard.jsx   Statistics, charts and tables at /admin
    ChangePassword.jsx   Change your own password (from the top bar)
    DevCrash.jsx         Development only: /__crash pages that throw, to try the error screens
    ForgotPassword.jsx   "Forgot password": asks for a reset link by email
    Login.jsx            Sign-in page: session-expired, lockout, rate-limit and error notices
    NewTicket.jsx        New ticket form
    NotFoundPage.jsx     An address that matches no route: "Page not found" in the layout, or a public frame
    SetPassword.jsx      "Set your password" after logging in with a temporary password
    SetPasswordWithLink.jsx  /set-password?token=…: set a password with a one-time link (new account or reset)
    TicketDetail.jsx     One ticket: comments, management boxes, info and history
    TicketList.jsx       Ticket list with filters
    Users.jsx            User management at /admin/users
  utils/
    browser.js           Full page loads (reload, go to a URL), replaceable in tests
    format.js            Status and role labels, dates, durations and initials
    linkToken.js         Reads a set-password link's token once and takes it out of the URL (plus no-referrer)
    passwordRules.js     The password rule as a live checklist for the password forms
    requestedPath.js     The path shown on "Page not found", and whether "Go back" stays in the app
    returnPath.js        Which page to return to after login (only paths on this site)
    wait.js              Reads Retry-After and formats the time left
  App.jsx                All pages and their routes
  router.jsx             The data router's root route (wraps App in the auth provider and an error boundary)
  index.css              All styles: design tokens, components and responsive rules
  main.jsx               Entry point: starts Sentry (if configured), mounts the app on the router inside the error boundary
index.html               HTML page that loads the app
scripts/
  static-not-found.js    Vite plugin: `vite preview` answers missing files with 404, not index.html
vite.config.js           Vite configuration
.env.example             Example environment file
.oxlintrc.json           Linter rules
TASKS.md                 Project task list
```

## Team

- **Enesa Sejdiu:** backend (all phases), login and register, layout, ticket list, new ticket, ticket detail, final clean-up
- **Aulona:** admin dashboard, user management
