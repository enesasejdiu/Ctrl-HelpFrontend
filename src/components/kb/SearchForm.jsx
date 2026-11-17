// SearchForm.jsx – the knowledge base's search box. Submitting opens /kb/search?q=… (the query lives in the URL, so
// results can be shared and reloaded). A search shorter than 2 characters says so instead of searching.
import { Search } from 'lucide-react'
import { useId, useState } from 'react'
import { useNavigate } from 'react-router'
import { t } from '../../i18n'
import { SEARCH_MAX, SEARCH_MIN } from '../../utils/kb'

export default function SearchForm({ initialQuery = '' }) {
  const navigate = useNavigate()
  const id = useId()
  const [query, setQuery] = useState(initialQuery)
  const [error, setError] = useState('')

  function handleSubmit(event) {
    event.preventDefault()
    const q = query.trim()
    if (q.length < SEARCH_MIN) return setError(t('kb.search.tooShort', { min: SEARCH_MIN }))
    setError('')
    navigate(`/kb/search?${new URLSearchParams({ q })}`)
  }

  return (
    <form className="kb-search" role="search" onSubmit={handleSubmit} noValidate>
      <label htmlFor={id} className="sr-only">
        {t('kb.search.label')}
      </label>
      <div className="kb-search__row">
        <Search size={18} aria-hidden="true" className="kb-search__icon" />
        <input
          id={id}
          type="search"
          className="input kb-search__input"
          placeholder={t('kb.search.placeholder')}
          value={query}
          maxLength={SEARCH_MAX}
          onChange={(e) => {
            setQuery(e.target.value)
            setError('')
          }}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
        />
        <button type="submit" className="btn btn--primary">
          {t('kb.search.submit')}
        </button>
      </div>
      {error && (
        <span id={`${id}-error`} className="field__hint field__hint--error" role="alert">
          {error}
        </span>
      )}
    </form>
  )
}
