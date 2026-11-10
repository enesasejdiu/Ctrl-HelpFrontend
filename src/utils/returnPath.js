// returnPath.js – where to send the user after logging in. Only a path on this same site is accepted, so the return
// address can never send someone to another site (an open redirect) or back to /login.

// "/tickets/7?status=open#x" → the same string; "https://evil.example", "//evil.example", "javascript:…" → null
export function safeReturnPath(path) {
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//') || path.startsWith('/\\')) return null
  let url
  try {
    // The URL parser also undoes tricks such as "/\t/evil.example" (tabs and newlines are dropped, giving "//…")
    url = new URL(path, window.location.origin)
  } catch {
    return null
  }
  if (url.origin !== window.location.origin || url.pathname === '/login') return null
  return `${url.pathname}${url.search}${url.hash}`
}

// The page ProtectedRoute saved in the router state ({ pathname, search, hash }) as a path, if it's a safe one
export function returnPathFrom(from) {
  if (!from || typeof from.pathname !== 'string') return null
  return safeReturnPath(`${from.pathname}${from.search || ''}${from.hash || ''}`)
}
