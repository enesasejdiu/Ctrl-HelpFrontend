// ErrorBoundary.jsx – catches errors thrown while rendering its children and shows `fallback` instead of a blank screen.
// React only supports this as a class component (and react-error-boundary isn't a dependency).
// - Logs each crash once, under an event ID whose reference (its first 8 characters) the fallback shows.
// - A chunk load error (a file from an older deploy) reloads the page once instead; see chunkReload.js.
// - Changing `resetKey` (e.g. the location) clears the error, so it doesn't stick to the next page.
// Only render errors end up here: event handlers, timers and promises are covered by GlobalErrorListener.
import { Component } from 'react'
import { chunkReloadAllowed, isChunkLoadError, reloadForChunkError } from './chunkReload'
import { logError, newEventId, referenceFor } from './logger'
import { errorText } from './messages'

const CLEAR = { error: null, componentStack: null, eventId: null, reloading: false }

/**
 * @param props.level     'app' or 'route' (goes into the log as render-app / render-route)
 * @param props.fallback  ({ error, componentStack, referenceId, reset }) => element
 * @param props.resetKey  clears the error when it changes
 * @param props.route     the route's path for the log (default: the browser's)
 */
export default class ErrorBoundary extends Component {
  state = CLEAR

  // Must stay free of side effects (React may call it twice): only reads whether a reload is allowed
  static getDerivedStateFromError(error) {
    return {
      error,
      componentStack: null,
      eventId: newEventId(),
      reloading: isChunkLoadError(error) && chunkReloadAllowed(),
    }
  }

  componentDidCatch(error, info) {
    const { eventId, reloading } = this.state
    logError({
      error,
      kind: reloading ? 'chunk-reload' : `render-${this.props.level}`,
      componentStack: info.componentStack,
      route: this.props.route,
      eventId,
    })
    if (reloading && reloadForChunkError()) return
    this.setState({ reloading: false, componentStack: info.componentStack })
  }

  componentDidUpdate(prevProps) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) this.reset()
  }

  reset = () => this.setState(CLEAR)

  render() {
    const { error, componentStack, eventId, reloading } = this.state
    if (!error) return this.props.children
    // Shown for the moment until the page reloads
    if (reloading) return <p role="status">{errorText('error.reloading')}</p>
    return this.props.fallback({ error, componentStack, referenceId: referenceFor(eventId), reset: this.reset })
  }
}
