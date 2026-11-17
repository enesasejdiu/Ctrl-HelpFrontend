// useSuggestions.js – asks the backend for similar open tickets and help articles while a title is typed.
//   - nothing is asked below MIN_QUERY characters (trimmed), or while `enabled` is false
//   - the request goes out DEBOUNCE_MS after the last keystroke; a newer keystroke cancels the one waiting or running
//     (AbortController), and an answer that isn't for the latest request is ignored
//   - errors (429 too) just mean "no suggestions": the form never waits for this
// Returns { query, results, loading }: results is { tickets, articles } for `query` (the text it was asked for), or
// null. While a newer request runs, the previous results stay, with loading = true.
import { useEffect, useRef, useState } from 'react'
import { getSuggestions } from '../../api/search'

export const MIN_QUERY = 3
export const MAX_QUERY = 200
export const DEBOUNCE_MS = 300

const IDLE = { query: '', results: null, loading: false }

export function useSuggestions(title, { enabled = true } = {}) {
  // The backend takes at most MAX_QUERY characters; a longer title is searched by its start
  const query = title.trim().slice(0, MAX_QUERY)
  const active = enabled && query.length >= MIN_QUERY
  const [state, setState] = useState(IDLE)
  const latest = useRef(0)
  // Turned off (too short, dismissed): the old results are dropped, so they never come back for a new title. Done
  // while rendering, as React suggests for state that follows a prop, not in an effect.
  const [wasActive, setWasActive] = useState(active)
  if (active !== wasActive) {
    setWasActive(active)
    if (!active) setState(IDLE)
  }

  useEffect(() => {
    if (!active) return undefined
    const request = ++latest.current
    const controller = new AbortController()
    const timer = setTimeout(() => {
      setState((current) => ({ ...current, loading: true }))
      getSuggestions(query, { signal: controller.signal })
        .then((results) => {
          if (request === latest.current) setState({ query, results, loading: false })
        })
        .catch(() => {
          // A cancelled request was replaced by a newer one (or the form went away): that one decides
          if (request === latest.current && !controller.signal.aborted) setState(IDLE)
        })
    }, DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [active, query])

  return active ? state : IDLE
}
