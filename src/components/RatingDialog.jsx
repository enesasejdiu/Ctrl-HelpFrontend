// RatingDialog.jsx – "How did we do?": the requester rates a closed ticket with 1–5 stars and an optional comment.
// POST /tickets/:id/rating { stars, comment? } → 201 { stars, comment, created_at }. Each ticket can be rated once.
// The stars are native radio buttons, so the arrow keys move between them and each one is read as "3 of 5 stars".
// Skip (or Escape) closes the dialog without rating; the ticket page then offers "Rate this ticket" instead.
import { LoaderCircle, Send, Star } from 'lucide-react'
import { useId, useState } from 'react'
import client, { errorMessage } from '../api/client'
import Modal from './Modal'
import { Alert } from './Ui'

const COMMENT_MAX = 500
const MAX_STARS = 5
const STARS = Array.from({ length: MAX_STARS }, (_, i) => i + 1)

const starsLabel = (stars) => `${stars} of ${MAX_STARS} stars`

export default function RatingDialog({ ticketId, onSaved, onSkip, returnFocusRef }) {
  const name = useId()
  const [stars, setStars] = useState(0)
  // The star under the mouse, to preview a choice before clicking it
  const [hovered, setHovered] = useState(0)
  const [comment, setComment] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const shown = hovered || stars

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    if (!stars) {
      setFieldErrors({ stars: 'Choose from 1 to 5 stars' })
      return
    }
    setSaving(true)
    try {
      const text = comment.trim()
      const { data } = await client.post(`/tickets/${ticketId}/rating`, text ? { stars, comment: text } : { stars })
      onSaved(data)
    } catch (err) {
      const status = err.response?.status
      // Already rated (for example in another tab): nothing left to do here, the page shows that rating
      if (status === 409) {
        onSaved(null)
        return
      }
      const byField = {}
      for (const { field, message } of err.response?.data?.errors ?? []) {
        if (['stars', 'comment'].includes(field)) byField[field] ??= message
      }
      if (status === 400 && Object.keys(byField).length > 0) setFieldErrors(byField)
      else setError(errorMessage(err))
      setSaving(false)
    }
  }

  function choose(value) {
    setStars(value)
    setFieldErrors((current) => ({ ...current, stars: undefined }))
  }

  return (
    <Modal
      title="How did we do?"
      onClose={saving ? undefined : onSkip}
      returnFocusRef={returnFocusRef}
      footer={
        <>
          <button type="button" className="btn btn--secondary" onClick={onSkip} disabled={saving}>
            Skip
          </button>
          <button type="submit" form="rating-form" className="btn btn--primary" disabled={saving}>
            {saving ? (
              <LoaderCircle size={16} className="spin" aria-hidden="true" />
            ) : (
              <Send size={16} aria-hidden="true" />
            )}
            {saving ? 'Sending…' : 'Send'}
          </button>
        </>
      }
    >
      <form id="rating-form" className="form" onSubmit={handleSubmit} noValidate>
        {error && <Alert>{error}</Alert>}
        <p className="text-muted">Your ticket is closed. Tell IT how it went: it takes a few seconds.</p>

        <fieldset
          className="field rating-field"
          aria-invalid={fieldErrors.stars ? true : undefined}
          aria-describedby={fieldErrors.stars ? 'rating-stars-error' : undefined}
        >
          <legend>Rating</legend>
          <div className="star-picker" onMouseLeave={() => setHovered(0)}>
            {STARS.map((value) => (
              <label key={value} className="star-picker__star" onMouseEnter={() => setHovered(value)}>
                <input
                  type="radio"
                  className="sr-only"
                  name={name}
                  value={value}
                  checked={stars === value}
                  onChange={() => choose(value)}
                  aria-label={starsLabel(value)}
                  data-autofocus={value === 1 ? true : undefined}
                />
                <Star size={32} aria-hidden="true" className={value <= shown ? 'star star--on' : 'star'} />
              </label>
            ))}
          </div>
          <span className="field__hint" aria-hidden="true">
            {shown ? starsLabel(shown) : 'Pick a number of stars'}
          </span>
          {fieldErrors.stars && (
            <span id="rating-stars-error" className="field__hint field__hint--error">
              {fieldErrors.stars}
            </span>
          )}
        </fieldset>

        <div className="field">
          <label htmlFor="rating-comment">
            Comment <span className="field__optional">Optional</span>
          </label>
          <textarea
            id="rating-comment"
            className="textarea"
            rows={3}
            value={comment}
            maxLength={COMMENT_MAX}
            placeholder="What went well, or what could be better?"
            onChange={(e) => {
              setComment(e.target.value)
              setFieldErrors((current) => ({ ...current, comment: undefined }))
            }}
            aria-invalid={fieldErrors.comment ? true : undefined}
            aria-describedby={fieldErrors.comment ? 'rating-comment-error' : 'rating-comment-count'}
          />
          <span id="rating-comment-count" className="field__hint">
            {comment.length}/{COMMENT_MAX}
          </span>
          {fieldErrors.comment && (
            <span id="rating-comment-error" className="field__hint field__hint--error">
              {fieldErrors.comment}
            </span>
          )}
        </div>
      </form>
    </Modal>
  )
}

// The stars of a saved rating, for showing it (not a control): "★★★★☆", read as "4 of 5 stars"
export function RatingStars({ stars }) {
  return (
    <span className="rating-stars" role="img" aria-label={starsLabel(stars)}>
      {STARS.map((value) => (
        <Star key={value} size={16} aria-hidden="true" className={value <= stars ? 'star star--on' : 'star'} />
      ))}
    </span>
  )
}
