// requestedPath.js – helpers for the "Page not found" page: the path to show, and whether "Go back" stays in the app.

export const MAX_PATH_LENGTH = 100

// The path as a person would type it: decoded (%3C → <), without control characters, cut to MAX_PATH_LENGTH.
// Pass location.pathname, which has no query string or hash. React renders it as text, so "<script>" stays text.
export function displayPath(pathname) {
  let path = String(pathname ?? '')
  try {
    path = decodeURIComponent(path)
  } catch {
    // A malformed escape (e.g. "%E0%A4%A"): show it as it is
  }
  const characters = Array.from(path.replace(/\p{Cc}/gu, '')) // whole characters, so an emoji isn't cut in half
  return characters.length > MAX_PATH_LENGTH
    ? `${characters.slice(0, MAX_PATH_LENGTH - 1).join('')}…`
    : characters.join('')
}

// True when the previous history entry belongs to this app. React Router numbers the entries it creates
// (history.state.idx: 0 for the page the tab opened on), so going back from idx > 0 lands on one of our pages.
export function hasInAppHistory() {
  const index = window.history.state?.idx
  return typeof index === 'number' && index > 0
}
