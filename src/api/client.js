// client.js – the single axios instance every API call goes through.
// The session lives in cookies the backend sets at login: tf_session (httpOnly, so this code can't read it; the
// browser sends it by itself) and tf_csrf (readable). Every request sends the cookies (withCredentials), and every
// change (POST/PATCH/PUT/DELETE) copies tf_csrf into the X-CSRF-Token header, which the backend requires. No token is
// ever read or stored here. An expired/invalid session (401, or a refused CSRF token) turns into a logout.
import axios from 'axios'

// Keys an older version of the app kept in localStorage. AuthProvider deletes them on startup; nothing reads them.
export const LEGACY_STORAGE_KEYS = ['ticketflow.token', 'ticketflow.user']

// Fired on window when the backend says the session is over; AuthContext listens and drops the user.
// event.detail.message is set when the user should be told why (shown on the login page).
// An event, because this file is plain JavaScript outside React and can't change React state itself
export const SESSION_EXPIRED_EVENT = 'ticketflow:session-expired'

// Fired when the backend refuses a request because the user still has a temporary password (for example after
// an admin reset it mid-session); AuthContext marks the user, and ProtectedRoute sends them to /set-password
export const PASSWORD_CHANGE_REQUIRED_EVENT = 'ticketflow:password-change-required'

export const CSRF_COOKIE = 'tf_csrf'
export const CSRF_HEADER = 'X-CSRF-Token'
export const SESSION_EXPIRED_MESSAGE = 'Your session expired, please sign in again'
const CSRF_METHODS = ['post', 'patch', 'put', 'delete']

// The value of a cookie this page can read (tf_csrf), or null
export function readCookie(name) {
  for (const part of document.cookie.split(';')) {
    const [key, ...value] = part.trim().split('=')
    if (key === name) return decodeURIComponent(value.join('='))
  }
  return null
}

// VITE_API_URL comes from the .env file; Vite puts it into the code at build time.
// withCredentials: send (and accept) the session cookies on requests to the API.
const client = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  withCredentials: true,
})

// Changes carry the CSRF token: another site can make the browser send our cookies, but it can't read tf_csrf
client.interceptors.request.use((config) => {
  if (CSRF_METHODS.includes((config.method || 'get').toLowerCase())) {
    const csrf = readCookie(CSRF_COOKIE)
    if (csrf) config.headers[CSRF_HEADER] = csrf
  }
  return config
})

// A 401 from login or change-password just means a wrong password was typed, so only other 401s end the session
const PASSWORD_CHECKS = ['/auth/login', '/auth/change-password']

client.interceptors.response.use(
  (response) => response,
  (error) => {
    const url = error.config?.url || ''
    const isPasswordCheck = PASSWORD_CHECKS.some((path) => url.startsWith(path))
    const { status, data } = error.response || {}
    if (status === 401 && !isPasswordCheck) {
      window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT, { detail: {} }))
    }
    // The CSRF cookie is missing or doesn't match (e.g. cookies were cleared or replaced): sign in again
    if (status === 403 && data?.code === 'CSRF_INVALID') {
      window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT, { detail: { message: SESSION_EXPIRED_MESSAGE } }))
    }
    if (status === 403 && data?.code === 'PASSWORD_CHANGE_REQUIRED') {
      window.dispatchEvent(new Event(PASSWORD_CHANGE_REQUIRED_EVENT))
    }
    return Promise.reject(error)
  },
)

// Human-readable message for a failed request: the backend's { message }, or a fallback
export function errorMessage(err) {
  if (err?.response?.data?.message) return err.response.data.message
  // A request without a response means the server never answered (it's down or unreachable)
  if (err?.request && !err.response) return 'Cannot reach the server. Check that the API is running.'
  return err?.message || 'Something went wrong'
}

export default client
