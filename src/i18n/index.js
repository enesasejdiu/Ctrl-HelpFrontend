// i18n – the app's translatable messages. English is the only language so far; another one is a new file next to en.js
// with the same keys, added to CATALOGS. No library: t() looks a key up, picks the plural form, and fills in {params}.
import en from './en'

const CATALOGS = { en }
const LOCALE = 'en'
const plural = new Intl.PluralRules(LOCALE)

function template(key, params) {
  const messages = CATALOGS[LOCALE]
  // With a count, "key_one" / "key_other" (as Intl.PluralRules names them) take precedence over the plain key
  if (typeof params.count === 'number') {
    const form = messages[`${key}_${plural.select(params.count)}`] ?? messages[`${key}_other`]
    if (form !== undefined) return form
  }
  if (Object.hasOwn(messages, key)) return messages[key]
  if (import.meta.env.DEV) console.warn(`i18n: no message for "${key}"`)
  return key
}

// t('login.locked', { time: '14:59' }) → "Too many failed attempts. … Try again in 14:59."
export function t(key, params = {}) {
  return template(key, params).replace(/\{(\w+)\}/g, (match, name) =>
    Object.hasOwn(params, name) ? String(params[name]) : match,
  )
}

// Like t(), but the params may be React elements (e.g. a live countdown), so the result is an array for JSX.
// Text stays text: nothing is ever parsed as HTML.
export function tNodes(key, params = {}) {
  return template(key, params)
    .split(/(\{\w+\})/)
    .filter(Boolean)
    .map((part) => {
      const name = /^\{(\w+)\}$/.exec(part)?.[1]
      return name && Object.hasOwn(params, name) ? params[name] : part
    })
}
