// GlobalErrorListener.jsx – logs what the error boundaries can't see: errors thrown outside rendering (event handlers,
// timers) and promise rejections nobody handled. These don't show the fallback page: most are recoverable, e.g. a failed
// request the page already reported inline.
// The exception is a chunk load error (a dynamic import from an older deploy): that reloads the page once, and if it
// happens again within the reload window, it is thrown into rendering so AppErrorBoundary shows the fallback.
// Renders nothing; lives inside AppErrorBoundary.
import { useEffect, useState } from 'react'
import { chunkReloadAllowed, isChunkLoadError, reloadForChunkError } from './chunkReload'
import { logError } from './logger'

export default function GlobalErrorListener() {
  const [fatal, setFatal] = useState(null)
  if (fatal) throw fatal

  useEffect(() => {
    function handle(error, kind) {
      if (isChunkLoadError(error)) {
        if (chunkReloadAllowed()) {
          logError({ error, kind: 'chunk-reload' })
          if (reloadForChunkError()) return
        }
        setFatal(error instanceof Error ? error : new Error(String(error))) // the boundary logs it
        return
      }
      logError({ error, kind })
    }

    // event.error is missing for cross-origin scripts ("Script error."); the message is all there is then
    const onError = (event) => handle(event.error ?? event.message, 'window-error')
    const onRejection = (event) => handle(event.reason, 'unhandled-rejection')
    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRejection)
    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
    }
  }, [])

  return null
}
