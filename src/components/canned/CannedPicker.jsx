// CannedPicker.jsx – picks a canned response and inserts it into the comment box (staff only; CommentForm opens it
// with the "Canned responses" button, or when "/" is typed into an empty comment).
//   - ARIA combobox: a search field (filters 200 ms after typing stops) controlling a listbox of titles with a
//     one-line preview; ↑/↓ move, Enter inserts, Esc closes, and focus goes back to the comment box
//   - a preview pane (wide screens) with the text filled in for this ticket; placeholders it doesn't know are marked,
//     with a warning, and stay as written
//   - inserting puts the text at the cursor (over a selection; over the "/" that opened it) the way typing would, so
//     Ctrl+Z works (utils/insertText.js). Nothing is ever sent: the user edits and sends the comment themselves.
import { AlertTriangle, LoaderCircle, Users } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router'
import { listCannedResponses, markCannedResponseUsed } from '../../api/cannedResponses'
import { t } from '../../i18n'
import { insertText } from '../../utils/insertText'
import { fillPlaceholders, placeholderParts } from '../../utils/placeholders'

export const SEARCH_DEBOUNCE_MS = 200
export const MANAGE_PATH = '/settings/canned-responses'

// `value`, 200 ms after it last changed
function useDebounced(value, delay) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

/**
 * @param textareaRef  the comment box
 * @param values       placeholder values for the open ticket (utils/placeholders.js placeholderValues)
 * @param slashAt      where the "/" that opened the picker is (it gets replaced), or null
 * @param onClose      called when the picker should go away; focus is already back in the comment box
 * @param toggleRef    the button that opens it (a click on it isn't an "outside" click)
 */
export default function CannedPicker({ textareaRef, values, slashAt = null, onClose, toggleRef }) {
  const id = useId()
  const panelRef = useRef(null)
  const inputRef = useRef(null)
  const [query, setQuery] = useState('')
  const search = useDebounced(query.trim(), SEARCH_DEBOUNCE_MS)
  const [result, setResult] = useState({ status: 'loading', items: [], search: '' })
  const [attempt, setAttempt] = useState(0)
  const [active, setActive] = useState(0)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    listCannedResponses({ q: search, scope: 'all' }, { signal: controller.signal })
      .then((items) => setResult({ status: 'ready', items, search }))
      .catch(() => {
        if (!controller.signal.aborted) setResult({ status: 'error', items: [], search })
      })
    return () => controller.abort()
  }, [search, attempt])

  // A click outside the picker (and outside its button) closes it, like Esc
  useEffect(() => {
    function handlePointerDown(event) {
      if (panelRef.current?.contains(event.target) || toggleRef?.current?.contains(event.target)) return
      onClose()
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [onClose, toggleRef])

  const { items, status } = result
  const current = items.length > 0 ? items[Math.min(active, items.length - 1)] : null
  const optionId = (item) => `${id}-option-${item.id}`

  function close() {
    textareaRef.current?.focus()
    onClose()
  }

  function insert(item) {
    const textarea = textareaRef.current
    const { text } = fillPlaceholders(item.body, values)
    // Over the "/" that opened the picker, if it's still there; otherwise at the cursor / over the selection
    const range = slashAt !== null && textarea.value[slashAt] === '/' ? { from: slashAt, to: slashAt + 1 } : {}
    insertText(textarea, text, range)
    markCannedResponseUsed(item.id)
    onClose()
  }

  function handleKeyDown(event) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (items.length === 0) return
      const index = Math.min(active, items.length - 1) + (event.key === 'ArrowDown' ? 1 : -1)
      setActive((index + items.length) % items.length)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      if (current) insert(current)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      close()
    }
  }

  // Keep the highlighted option in view while moving with the keyboard
  useEffect(() => {
    if (current) document.getElementById(optionId(current))?.scrollIntoView?.({ block: 'nearest' })
  })

  const listId = `${id}-list`
  return (
    <div ref={panelRef} className="canned-picker" role="dialog" aria-label={t('canned.picker.label')}>
      <div className="canned-picker__search">
        <input
          ref={inputRef}
          type="text"
          className="input"
          role="combobox"
          aria-label={t('canned.picker.search')}
          aria-autocomplete="list"
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={current ? optionId(current) : undefined}
          aria-describedby={`${id}-hint`}
          placeholder={t('canned.picker.search')}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setActive(0)
          }}
          onKeyDown={handleKeyDown}
          autoComplete="off"
        />
        {status === 'ready' && search !== query.trim() && (
          <LoaderCircle size={16} className="spin canned-picker__busy" aria-hidden="true" />
        )}
        <span id={`${id}-hint`} className="canned-picker__hint">
          {t('canned.picker.hint')}
        </span>
      </div>

      {/* Says how many were found, without moving focus */}
      <p className="sr-only" aria-live="polite">
        {status === 'ready' ? t('canned.picker.count', { count: items.length }) : ''}
      </p>

      <div className="canned-picker__body">
        <ul id={listId} role="listbox" aria-label={t('canned.picker.list')} className="canned-picker__list">
          {items.map((item) => (
            <li
              key={item.id}
              id={optionId(item)}
              role="option"
              aria-selected={item === current}
              className={`canned-option${item === current ? ' is-active' : ''}`}
              // Keeps focus in the search field, so the keyboard keeps working after a click
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActive(items.indexOf(item))}
              onClick={() => insert(item)}
            >
              <span className="canned-option__title">
                {item.title}
                {item.shared && (
                  <span className="canned-option__shared">
                    <Users size={12} aria-hidden="true" /> {t('canned.picker.shared')}
                  </span>
                )}
              </span>
              <span className="canned-option__body">{item.body}</span>
            </li>
          ))}
        </ul>

        {current && <Preview body={current.body} values={values} id={id} />}
      </div>

      {status === 'loading' && (
        <p className="canned-picker__state" role="status">
          <LoaderCircle size={16} className="spin" aria-hidden="true" /> {t('canned.picker.loading')}
        </p>
      )}
      {status === 'error' && (
        <div className="canned-picker__state">
          <span role="alert">{t('canned.picker.error')}</span>{' '}
          <button type="button" className="btn btn--secondary btn--sm" onClick={() => setAttempt((n) => n + 1)}>
            {t('canned.picker.retry')}
          </button>
        </div>
      )}
      {status === 'ready' && items.length === 0 && (
        <p className="canned-picker__state">
          {result.search ? (
            t('canned.picker.noMatch', { q: result.search })
          ) : (
            <>
              {t('canned.picker.empty')} <Link to={MANAGE_PATH}>{t('canned.picker.create')}</Link>
            </>
          )}
        </p>
      )}

      <div className="canned-picker__footer">
        <Link to={MANAGE_PATH}>{t('canned.picker.manage')}</Link>
      </div>
    </div>
  )
}

// The highlighted response, filled in for this ticket; placeholders it doesn't know are marked, with a warning
function Preview({ body, values, id }) {
  const parts = placeholderParts(body, values)
  const { unknown } = fillPlaceholders(body, values)
  return (
    <section className="canned-picker__preview" aria-labelledby={`${id}-preview`}>
      <h3 id={`${id}-preview`} className="canned-picker__preview-title">
        {t('canned.picker.preview')}
      </h3>
      <p className="canned-picker__preview-text user-text">
        {parts.map((part, index) =>
          part.kind === 'unknown' ? (
            <mark key={index} className="canned-unknown">
              {part.text}
            </mark>
          ) : (
            <span key={index} className={part.kind === 'filled' ? 'canned-filled' : undefined}>
              {part.text}
            </span>
          ),
        )}
      </p>
      {unknown.length > 0 && (
        <p className="canned-picker__warning">
          <AlertTriangle size={14} aria-hidden="true" />
          {t('canned.picker.unknown', { count: unknown.length, list: unknown.join(', ') })}
        </p>
      )}
      <p className="canned-picker__preview-hint">{t('canned.picker.previewHint')}</p>
    </section>
  )
}
