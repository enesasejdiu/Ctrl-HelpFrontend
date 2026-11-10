// messages.js – the error screens' text. It goes through i18n, but the fallback must still render if i18n itself is what
// broke, so every message has a plain English default here.
import { t } from '../i18n'

const DEFAULTS = {
  'error.title': 'Something went wrong',
  'error.text': 'An unexpected error occurred. You can try again, or go back to the home page.',
  'error.tryAgain': 'Try again',
  'error.home': 'Go to home page',
  'error.reload': 'Reload page',
  'error.reference': 'Error reference:',
  'error.details': 'Error details (development only)',
  'error.componentStack': 'Component stack',
  'error.reloading': 'Loading the latest version…',
}

export function errorText(key) {
  try {
    const value = t(key)
    if (typeof value === 'string' && value && value !== key) return value
  } catch {
    // fall back to the default below
  }
  return DEFAULTS[key]
}
