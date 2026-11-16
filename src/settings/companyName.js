// companyName.js – the company name shown next to the logo (top bar and login page), from GET /settings/public (no
// login needed). Loaded once and shared by every component through useCompanyName(); the Settings page calls
// setCompanyName() after saving, so the top bar changes at once. "TicketFlow" whenever the name is empty or the request
// fails.
import { useEffect, useSyncExternalStore } from 'react'
import client from '../api/client'

export const DEFAULT_COMPANY_NAME = 'TicketFlow'

let name = null // null until loaded (or when it failed): the default is shown
let loading = null
const listeners = new Set()

function emit() {
  for (const listener of listeners) listener()
}

export function setCompanyName(next) {
  name = typeof next === 'string' && next.trim() ? next.trim() : null
  emit()
}

// Loads the name once per page load; later calls reuse the same request
export function loadCompanyName() {
  if (!loading) {
    loading = client
      .get('/settings/public')
      .then(({ data }) => setCompanyName(data?.company_name))
      .catch(() => setCompanyName(null))
  }
  return loading
}

// For tests: forget what was loaded
export function resetCompanyName() {
  name = null
  loading = null
  emit()
}

function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

// The name to show, always a non-empty string
export function useCompanyName() {
  const current = useSyncExternalStore(subscribe, () => name)
  useEffect(() => {
    loadCompanyName()
  }, [])
  return current || DEFAULT_COMPANY_NAME
}
