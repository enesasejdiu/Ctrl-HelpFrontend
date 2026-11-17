// useCompactNav.js – whether the top bar's navigation must show icons only (Layout.jsx): true when its links, with
// their labels, are wider than the space the bar leaves for them. Measured, not guessed, so it holds for any role (an
// admin has eight links, an employee three), any window size and any label text.
//
// While the labels show, the width they need is noted (scrollWidth); in compact mode that noted width is compared with
// the space available (clientWidth: the nav takes whatever the logo and the user box leave), so the bar switches back as
// soon as the labels fit again, without flickering. The ResizeObserver reports once right after it starts and then on
// every resize. Other links (e.g. someone else logged in) start again from labels shown, and are measured afresh.
// Without ResizeObserver (very old browsers, tests) the labels always show.
import { useLayoutEffect, useRef, useState } from 'react'

export function useCompactNav(navRef, linksKey) {
  const [state, setState] = useState({ key: linksKey, compact: false })
  const neededWidth = useRef(0)
  // A state measured for other links doesn't count
  const compact = state.key === linksKey && state.compact

  useLayoutEffect(() => {
    const nav = navRef.current
    if (!nav || typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(() => {
      if (!compact) neededWidth.current = nav.scrollWidth
      const next = neededWidth.current > nav.clientWidth
      setState((current) =>
        current.key === linksKey && current.compact === next ? current : { key: linksKey, compact: next },
      )
    })
    observer.observe(nav)
    return () => observer.disconnect()
  }, [navRef, compact, linksKey])

  return compact
}
