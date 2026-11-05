// NewTicket.jsx – report a problem at /tickets/new.
// Categories and priorities come from GET /meta; the ticket is saved with POST /tickets,
// then we go straight to the new ticket's page.
import { ArrowLeft, LoaderCircle, Send } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import client, { errorMessage } from '../api/client'
import { Alert, PageHeader, Spinner } from '../components/Ui'
import { formatHours } from '../utils/format'

const TITLE_MAX = 150 // same limit as the backend
const DEFAULT_PRIORITY = 'Medium'

export default function NewTicket() {
  const navigate = useNavigate()
  const [meta, setMeta] = useState(null) // { categories, priorities } once loaded
  const [form, setForm] = useState({ title: '', category_id: '', priority_id: '', description: '' })
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Load the dropdown options and preselect the default priority
  useEffect(() => {
    client
      .get('/meta')
      .then(({ data }) => {
        setMeta(data)
        const medium = data.priorities.find((p) => p.name === DEFAULT_PRIORITY)
        if (medium) setForm((current) => ({ ...current, priority_id: String(medium.id) }))
      })
      .catch((err) => setError(errorMessage(err)))
  }, [])

  function update(field) {
    return (event) => setForm((current) => ({ ...current, [field]: event.target.value }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    // Same rules as the backend, checked first for an instant message
    if (!form.title.trim() || !form.description.trim() || !form.category_id || !form.priority_id) {
      setError('Please fill in the title, category, priority and description.')
      return
    }
    setSubmitting(true)
    try {
      const { data } = await client.post('/tickets', {
        title: form.title.trim(),
        description: form.description.trim(),
        category_id: Number(form.category_id),
        priority_id: Number(form.priority_id),
      })
      navigate(`/tickets/${data.id}`, { replace: true })
    } catch (err) {
      setError(errorMessage(err))
      setSubmitting(false)
    }
  }

  const category = meta?.categories.find((c) => String(c.id) === form.category_id)
  const priority = meta?.priorities.find((p) => String(p.id) === form.priority_id)

  return (
    <>
      <PageHeader
        title="New ticket"
        subtitle="Tell IT what's wrong. The more detail you give, the faster it gets fixed."
        actions={
          <Link to="/tickets" className="btn btn--secondary">
            <ArrowLeft size={16} aria-hidden="true" />
            Back to tickets
          </Link>
        }
      />

      <section className="card form-card">
        {meta === null && !error ? (
          <Spinner label="Loading form…" />
        ) : (
          <form className="form" onSubmit={handleSubmit} noValidate>
            {error && <Alert>{error}</Alert>}

            <div className="field">
              <label htmlFor="title">
                Title
                <span className="field__optional">
                  {form.title.length}/{TITLE_MAX}
                </span>
              </label>
              <input
                id="title"
                className="input"
                placeholder="e.g. Laptop won't connect to the office Wi-Fi"
                value={form.title}
                onChange={update('title')}
                maxLength={TITLE_MAX}
                required
                autoFocus
              />
            </div>

            <div className="form-row">
              <div className="field">
                <label htmlFor="category">Category</label>
                <select id="category" className="select" value={form.category_id} onChange={update('category_id')} required>
                  <option value="">Choose a category…</option>
                  {meta?.categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                {category?.description && <span className="field__hint">{category.description}</span>}
              </div>

              <div className="field">
                <label htmlFor="priority">Priority</label>
                <select id="priority" className="select" value={form.priority_id} onChange={update('priority_id')} required>
                  {!form.priority_id && <option value="">Choose a priority…</option>}
                  {meta?.priorities.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                {priority && <span className="field__hint">IT aims to resolve it within {formatHours(priority.target_hours)}.</span>}
              </div>
            </div>

            <div className="field">
              <label htmlFor="description">Description</label>
              <textarea
                id="description"
                className="textarea"
                rows={7}
                placeholder="What happened? When did it start? What have you already tried? Include any error messages."
                value={form.description}
                onChange={update('description')}
                required
              />
            </div>

            <div className="form-actions">
              <Link to="/tickets" className="btn btn--secondary">
                Cancel
              </Link>
              <button type="submit" className="btn btn--primary" disabled={submitting || !meta}>
                {submitting ? <LoaderCircle size={16} className="spin" aria-hidden="true" /> : <Send size={16} aria-hidden="true" />}
                {submitting ? 'Creating…' : 'Create ticket'}
              </button>
            </div>
          </form>
        )}
      </section>
    </>
  )
}
