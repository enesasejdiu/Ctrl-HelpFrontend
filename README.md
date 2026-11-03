# TicketFlow – Frontend

Web frontend for **TicketFlow**, an IT helpdesk / ticketing system.

## Stack

- [React](https://react.dev/) (JavaScript / JSX)
- [Vite](https://vite.dev/) – dev server and build tool
- [React Router](https://reactrouter.com/) – client-side routing
- [Axios](https://axios-http.com/) – HTTP client for the backend API
- [Recharts](https://recharts.org/) – dashboard charts
- [Lucide](https://lucide.dev/) – icons

## Getting started

Requirements: Node.js 20+ and npm.

```bash
# 1. Install dependencies
npm install

# 2. Create your local environment file
cp .env.example .env

# 3. Start the dev server
npm run dev
```

The app runs at http://localhost:5173.

## Environment variables

| Variable       | Description              | Default                     |
| -------------- | ------------------------ | --------------------------- |
| `VITE_API_URL` | Base URL of the backend API | `http://localhost:5050/api` |

## Scripts

| Command           | Description                     |
| ----------------- | ------------------------------- |
| `npm run dev`     | Start the dev server            |
| `npm run build`   | Build for production (`dist/`)  |
| `npm run preview` | Preview the production build    |
| `npm run lint`    | Lint the code with oxlint       |

## Project structure

```
src/
  api/         Axios client (token header, 401 handling, errorMessage)
  context/     Login state (AuthProvider + useAuth)
  components/  Layout, route guard, badges and other shared UI
  pages/       Route-level pages
  utils/       Display helpers (status labels, dates, initials)
  App.jsx      Root component
  main.jsx     Entry point (mounts App inside BrowserRouter)
```
