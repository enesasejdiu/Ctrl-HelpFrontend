// ErrorFallback.jsx – the "Something went wrong" screen. variant "page" fills the window (the app-level boundary);
// "route" sits inside the layout, so the top bar keeps working.
// It depends on nothing that could itself be broken: no router, no auth, no API, no shared UI components. The buttons'
// actions are passed in by the boundary that shows it.
// The error's message and stacks are shown only in development; production shows the reference ID alone.
import { useEffect, useRef } from 'react'
import { errorText } from './messages'

export default function ErrorFallback({
  variant = 'route',
  error,
  componentStack,
  referenceId,
  onRetry,
  onHome,
  onReload,
  showDetails = import.meta.env.DEV,
}) {
  const headingRef = useRef(null)

  // Screen-reader and keyboard users start at the heading instead of wherever focus was when the page broke
  useEffect(() => {
    headingRef.current?.focus()
  }, [])

  const details = showDetails
    ? [
        error instanceof Error ? `${error.name}: ${error.message}` : String(error),
        error instanceof Error && error.stack,
        componentStack && `${errorText('error.componentStack')}:${componentStack}`,
      ]
        .filter(Boolean)
        .join('\n\n')
    : null

  return (
    <div className={`error-fallback error-fallback--${variant}`}>
      <div className="error-fallback__card" role="alert">
        <h1 ref={headingRef} tabIndex={-1}>
          {errorText('error.title')}
        </h1>
        <p>{errorText('error.text')}</p>
        <div className="error-fallback__actions">
          <button type="button" className="btn btn--primary" onClick={onRetry}>
            {errorText('error.tryAgain')}
          </button>
          <button type="button" className="btn btn--secondary" onClick={onHome}>
            {errorText('error.home')}
          </button>
          {onReload && (
            <button type="button" className="btn btn--secondary" onClick={onReload}>
              {errorText('error.reload')}
            </button>
          )}
        </div>
        {referenceId && (
          <p className="error-fallback__reference">
            {errorText('error.reference')} <code>{referenceId}</code>
          </p>
        )}
        {details && (
          <details className="error-fallback__details">
            <summary>{errorText('error.details')}</summary>
            <pre>{details}</pre>
          </details>
        )}
      </div>
    </div>
  )
}
