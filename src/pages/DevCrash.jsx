// DevCrash.jsx – development only (App.jsx registers its routes only when import.meta.env.DEV, so production builds
// leave it out). Throws while rendering, to try the error screens:
//   /__crash        a page crash: the route-level fallback, top bar still working
//   /__crash/chunk  a chunk load error: one automatic reload, then the fallback if it happens again within 5 minutes
//   /__crash/app    a crash outside the layout: the full-page fallback
export default function DevCrash({ kind = 'render' }) {
  if (kind === 'chunk') throw new Error('Failed to fetch dynamically imported module: /assets/__crash-missing.js')
  throw new Error(`Test crash from /__crash (${kind})`)
}
