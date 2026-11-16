// NewTicket.jsx – the "report a problem" form at /tickets/new.
// Categories and priorities come from GET /meta; priority defaults to Medium.
// Files can be attached under the description. On submit the ticket is created first, then each file is uploaded on
// its own, with progress. The user then lands on the new ticket's page; files that failed are passed along (navigation
// state, `failedUploads`), so that page can show them with "Try again". The ticket exists either way.
import { ArrowLeft, LoaderCircle, Send } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { uploadFiles } from '../api/attachments'
import client, { errorMessage } from '../api/client'
import AttachmentDropzone from '../components/AttachmentDropzone'
import { PriorityBadge } from '../components/Badges'
import UploadStatusList from '../components/UploadStatusList'
import { Alert, PageHeader, Spinner } from '../components/Ui'
import { targetLabel } from '../utils/format'

const TITLE_MAX = 150 // same limit as the backend

export default function NewTicket() {
  const navigate = useNavigate()
  const [meta, setMeta] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [form, setForm] = useState({ title: '', category_id: '', priority_id: '', description: '' })
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [files, setFiles] = useState([])
  // While the files are uploaded after the ticket was created: one entry per file (see UploadStatusList)
  const [uploads, setUploads] = useState(null)
  // Set by a submit with missing fields, so they get marked invalid until filled in
  const [triedSubmit, setTriedSubmit] = useState(false)

  // Load the dropdown data; preselect Medium as the default priority
  useEffect(() => {
    client
      .get('/meta')
      .then(({ data }) => {
        setMeta(data)
        const medium = data.priorities.find((p) => p.name === 'Medium')
        if (medium) setForm((current) => ({ ...current, priority_id: String(medium.id) }))
      })
      .catch((err) => setLoadError(errorMessage(err)))
  }, [])

  // One change handler for every field: update('title') returns the handler for the title input
  function update(field) {
    return (event) => setForm((current) => ({ ...current, [field]: event.target.value }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    if (!form.title.trim() || !form.category_id || !form.priority_id || !form.description.trim()) {
      setTriedSubmit(true)
      setError('Please fill in the title, category, priority and description')
      return
    }
    setSubmitting(true)
    try {
      const { data } = await client.post('/tickets', {
        title: form.title.trim(),
        description: form.description.trim(),
        // Dropdown values are always strings, but the API expects numeric ids
        category_id: Number(form.category_id),
        priority_id: Number(form.priority_id),
      })
      // The ticket exists from here on: a failed upload never undoes it
      let failedUploads = []
      if (files.length > 0) {
        setUploads(files.map((file) => ({ name: file.name, status: 'waiting' })))
        const results = await uploadFiles(data.id, files, (index, change) =>
          setUploads((current) => current.map((upload, i) => (i === index ? { ...upload, ...change } : upload))),
        )
        failedUploads = results.filter((result) => result.error)
      }
      navigate(`/tickets/${data.id}`, failedUploads.length > 0 ? { state: { failedUploads } } : undefined)
    } catch (err) {
      setError(errorMessage(err))
      setSubmitting(false)
    }
  }

  // The category currently picked, to show its description under the dropdown
  const category = meta?.categories.find((c) => String(c.id) === form.category_id)
  // aria-invalid for a required field that was left empty on submit (undefined = attribute left out)
  const missing = (value) => (triedSubmit && !value.trim()) || undefined

  return (
    <>
      <Link to="/tickets" className="back-link">
        <ArrowLeft size={16} aria-hidden="true" />
        Back to tickets
      </Link>
      <PageHeader title="New ticket" subtitle="Describe the problem and IT will pick it up as soon as possible." />

      {loadError && <Alert>{loadError}</Alert>}
      {meta && (meta.categories.length === 0 || meta.priorities.length === 0) && (
        <Alert>No categories or priorities are set up yet, so tickets can't be created. Please contact IT.</Alert>
      )}
      {!meta && !loadError && (
        <div className="card">
          <Spinner label="Loading form…" />
        </div>
      )}

      {meta && (
        <div className="split">
          <form className="card card--padded form" onSubmit={handleSubmit} noValidate>
            {error && <Alert>{error}</Alert>}

            <div className="field">
              <label htmlFor="title">
                Title
                {/* Visual counter only: inside the label it would become part of the field's name and be
                    re-read on every keystroke; screen readers get the limit from the hint below instead */}
                <span className="field__counter" aria-hidden="true">
                  {form.title.length}/{TITLE_MAX}
                </span>
              </label>
              <input
                id="title"
                className="input"
                placeholder="e.g. Laptop does not turn on"
                maxLength={TITLE_MAX}
                value={form.title}
                onChange={update('title')}
                aria-describedby="title-limit"
                aria-invalid={missing(form.title)}
                required
                autoFocus
              />
              <span id="title-limit" className="sr-only">
                Up to {TITLE_MAX} characters
              </span>
            </div>

            <div className="field">
              <label htmlFor="category">Category</label>
              <select
                id="category"
                className="select"
                value={form.category_id}
                onChange={update('category_id')}
                aria-invalid={missing(form.category_id)}
                required
              >
                <option value="">Choose a category…</option>
                {/* Archived categories aren't offered for new tickets (they stay on old ones) */}
                {meta.categories
                  .filter((c) => c.is_active !== false)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
              {category?.description && <span className="field__hint">{category.description}</span>}
            </div>

            {/* Priority as selectable cards, so the target time is visible before choosing */}
            <fieldset className="field">
              <legend>Priority</legend>
              <div className="option-cards">
                {meta.priorities.map((p) => (
                  <label key={p.id} className={`option-card${form.priority_id === String(p.id) ? ' is-selected' : ''}`}>
                    <input
                      type="radio"
                      name="priority"
                      value={p.id}
                      checked={form.priority_id === String(p.id)}
                      onChange={update('priority_id')}
                    />
                    <PriorityBadge priority={p.name} />
                    <span className="option-card__hint">Target: {targetLabel(p.target_hours)}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="field">
              <label htmlFor="description">Description</label>
              <textarea
                id="description"
                className="textarea"
                rows={7}
                placeholder="What happened? When did it start? What have you already tried?"
                value={form.description}
                onChange={update('description')}
                aria-invalid={missing(form.description)}
                required
              />
            </div>

            {uploads ? (
              <UploadStatusList uploads={uploads} label="Uploading attachments" />
            ) : (
              <AttachmentDropzone label="Attachments" files={files} onChange={setFiles} disabled={submitting} />
            )}

            <div className="form__actions">
              <Link to="/tickets" className="btn btn--secondary">
                Cancel
              </Link>
              <button type="submit" className="btn btn--primary" disabled={submitting}>
                {submitting ? (
                  <LoaderCircle size={16} className="spin" aria-hidden="true" />
                ) : (
                  <Send size={16} aria-hidden="true" />
                )}
                {submitting ? (uploads ? 'Uploading files…' : 'Submitting…') : 'Submit ticket'}
              </button>
            </div>
          </form>

          <aside className="card card--padded tips">
            <h2>Tips for a quick fix</h2>
            <ul>
              <li>Use a short title that says what is broken.</li>
              <li>Include any error message exactly as it appears.</li>
              <li>Say where you are and which device you use.</li>
              <li>
                Pick <strong>Critical</strong> only when work is blocked for many people.
              </li>
            </ul>
          </aside>
        </div>
      )}
    </>
  )
}
