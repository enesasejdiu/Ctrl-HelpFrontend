// wait.js – reading how long the backend asks us to wait (Retry-After) and showing the time left.
import { t } from '../i18n'

// Seconds from a response's Retry-After header: a number of seconds ("120") or an HTTP date. null when the header is
// missing or unreadable (also when a cross-origin API doesn't expose it; same-origin through the proxy it always can).
export function retryAfterSeconds(response) {
  const value = response?.headers?.['retry-after']
  if (value === undefined || value === null || value === '') return null
  const text = String(value).trim()
  if (/^\d+$/.test(text)) return Number(text) > 0 ? Number(text) : null
  const date = Date.parse(text)
  if (Number.isNaN(date)) return null
  const seconds = Math.ceil((date - Date.now()) / 1000)
  return seconds > 0 ? seconds : null
}

// Time left in ms → "4:59" (5 minutes or less, counted by the second) or "about 15 minutes" (longer waits)
export function formatWait(ms) {
  const seconds = Math.max(0, Math.ceil(ms / 1000))
  if (seconds > 5 * 60) return t('time.aboutMinutes', { count: Math.ceil(seconds / 60) })
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}
