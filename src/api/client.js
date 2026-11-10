// client.js – the single axios instance every API call goes through.
// Sessions are cookies the backend sets at login: tf_session (the JWT, httpOnly, so this code can never read it) and
// tf_csrf (readable). The browser sends both by itself; this file never sees or stores the token. It adds the CSRF
// header to requests that change something, and turns a rejected session (401) into a logout.
import axios from 'axios'

// Fired on window when the backend says the session is gone; AuthContext listens and drops the user
// An event, because this file is plain JavaScript outside React and can't change React state itself
export const SESSION_EXPIRED_EVENT = 'ticketflow:session-expired'

// Fired when the backend refuses a request because the user still has a temporary password (for example after
// an admin reset it mid-session); AuthContext marks the user, and ProtectedRoute sends them to /set-password
export const PASSWORD_CHANGE_REQUIRED_EVENT = 'ticketflow:password-change-required'

// Double-submit CSRF: a cookie-authenticated POST/PATCH/PUT/DELETE must send the tf_csrf cookie's value in this
// header. Another site can make the browser send the cookies, but it can't read tf_csrf to copy it.
export const CSRF_COOKIE = 'tf_csrf'
export const CSRF_HEADER = 'X-CSRF-Token'
const CSRF_METHODS = ['post', 'patch', 'put', 'delete']

// The value of a cookie this page can read (never tf_session: it's httpOnly), or null
export function readCookie(name) {
  const prefix = `${name}=`
  const found = document.cookie.split('; ').find((part) => part.startsWith(prefix))
  return found ? decodeURIComponent(found.slice(prefix.length)) : null
}

// VITE_API_URL comes from the .env file; Vite puts it into the code at build time. In development it's /api, which
// the Vite dev server proxies to the backend, so the page and the API share one origin (see vite.config.js).
const client = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  // Send the session cookies. Needed when the API is on another origin; harmless on the same one.
  withCredentials: true,
})

client.interceptors.request.use((config) => {
  if (CSRF_METHODS.includes((config.method || 'get').toLowerCase())) {
    const csrf = readCookie(CSRF_COOKIE)
    if (csrf) config.headers.set(CSRF_HEADER, csrf)
  }
  return config
})

// A 401 from these doesn't mean the session ended: login and change-password answer 401 for a wrong password (older
// backends), and logout needs no session at all
const NOT_A_SESSION_CHECK = ['/auth/login', '/auth/change-password', '/auth/logout']

client.interceptors.response.use(
  (response) => response,
  (error) => {
    const url = error.config?.url || ''
    const ignore401 = NOT_A_SESSION_CHECK.some((path) => url.startsWith(path))
    if (error.response?.status === 401 && !ignore401) {
      window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT))
    }
    if (error.response?.status === 403 && error.response.data?.code === 'PASSWORD_CHANGE_REQUIRED') {
      window.dispatchEvent(new Event(PASSWORD_CHANGE_REQUIRED_EVENT))
    }
    return Promise.reject(error)
  },
)

// Human-readable message for a failed request: the backend's { message }, or a fallback
// True for a 404: the record (or route) doesn't exist, e.g. a deleted ticket. Pages show <NotFound /> for it.
export function isNotFound(err) {
  return err?.response?.status === 404
}

export function errorMessage(err) {
  if (err?.response?.data?.message) return err.response.data.message
  // A request without a response means the server never answered (it's down or unreachable)
  if (err?.request && !err.response) return 'Cannot reach the server. Check that the API is running.'
  return err?.message || 'Something went wrong'
}

export default client
