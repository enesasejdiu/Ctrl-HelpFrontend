// client.js – the single axios instance every API call goes through.
// It adds the login token to each request and turns an expired/invalid session (401) into a logout.
import axios from 'axios'

// localStorage keys for the session; AuthContext reads and writes the same keys
export const TOKEN_KEY = 'ticketflow.token'
export const USER_KEY = 'ticketflow.user'

// Fired on window when the backend rejects our token; AuthContext listens and logs the user out
// An event, because this file is plain JavaScript outside React and can't change React state itself
export const SESSION_EXPIRED_EVENT = 'ticketflow:session-expired'

// Fired when the backend refuses a request because the user still has a temporary password (for example after
// an admin reset it mid-session); AuthContext marks the user, and ProtectedRoute sends them to /change-password
export const PASSWORD_CHANGE_REQUIRED_EVENT = 'ticketflow:password-change-required'

// VITE_API_URL comes from the .env file; Vite puts it into the code at build time
const client = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
})

// Attach "Authorization: Bearer <token>" when we have a token
client.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY)
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
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
    if (error.response?.status === 401 && !isPasswordCheck) {
      localStorage.removeItem(TOKEN_KEY)
      localStorage.removeItem(USER_KEY)
      window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT))
    }
    if (error.response?.status === 403 && error.response.data?.code === 'PASSWORD_CHANGE_REQUIRED') {
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
