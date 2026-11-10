// linkToken.js – the one-time token of an emailed set-password link (/set-password?token=...), read once and then taken
// out of the address bar, so it isn't kept in the browser history or sent on in a Referer header. While the link page
// is open, <meta name="referrer" content="no-referrer"> is set too.
//
// Both happen in layout effects: they run before any normal effect, so the page's first request (checking the link)
// already goes out from the address without the token. The token itself stays only in React state.
import { useLayoutEffect, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router'

export function useLinkTokenFromUrl() {
  const [searchParams] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  // Read once: after the token is removed from the URL, this keeps it for the page
  const [linkToken] = useState(() => searchParams.get('token') || null)

  useLayoutEffect(() => {
    if (!linkToken) return
    const params = new URLSearchParams(location.search)
    if (!params.has('token')) return
    params.delete('token')
    const search = params.toString() ? `?${params}` : ''
    // The browser's address right away (the router updates its own copy a moment later)
    window.history.replaceState(window.history.state, '', `${location.pathname}${search}${location.hash}`)
    navigate({ pathname: location.pathname, search, hash: location.hash }, { replace: true, state: location.state })
  }, [linkToken, location, navigate])

  useLayoutEffect(() => {
    if (!linkToken) return undefined
    const meta = document.createElement('meta')
    meta.name = 'referrer'
    meta.content = 'no-referrer'
    document.head.appendChild(meta)
    return () => meta.remove()
  }, [linkToken])

  return linkToken
}
