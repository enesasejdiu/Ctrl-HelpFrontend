// CategoryDialog.jsx – "Add category" and "Edit category" on the Settings page.
// Add (no `category`): POST /categories { name, description? }. Edit: PATCH /categories/:id with only what changed.
// The saved category goes to onSaved. A taken name (409) and the backend's field errors (400) show under the fields.
import { LoaderCircle, Plus, Save } from 'lucide-react'
import { useState } from 'react'
import client, { errorMessage } from '../api/client'
import Modal from './Modal'
import { Alert } from './Ui'

const NAME_MAX = 50
const DESCRIPTION_MAX = 255
const clean = (text) => text.trim().replace(/\s+/g, ' ')

export default function CategoryDialog({ category = null, onSaved, onCancel, returnFocusRef }) {
  const isEdit = category !== null
  const [name, setName] = useState(category?.name ?? '')
  const [description, setDescription] = useState(category?.description ?? '')
  const [fieldErrors, setFieldErrors] = useState({})
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const changes = () => {
    const next = { name: clean(name), description: description.trim() }
    if (!isEdit) return next.description ? next : { name: next.name }
    return Object.fromEntries(
      Object.entries(next).filter(
        ([field, value]) => value !== (field === 'name' ? category.name : (category.description ?? '')),
      ),
    )
  }
  const unchanged = isEdit && Object.keys(changes()).length === 0

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    if (!clean(name)) {
      setFieldErrors({ name: 'Name is required' })
      return
    }
    if (unchanged) return
    setSaving(true)
    try {
      const { data } = isEdit
        ? await client.patch(`/categories/${category.id}`, changes())
        : await client.post('/categories', changes())
      onSaved(data)
    } catch (err) {
      const status = err.response?.status
      const errors = err.response?.data?.errors ?? []
      const byField = {}
      for (const { field, message } of errors) if (['name', 'description'].includes(field)) byField[field] ??= message
      if (status === 409) setFieldErrors({ name: errorMessage(err) })
      else if (status === 400 && Object.keys(byField).length > 0) setFieldErrors(byField)
      else setError(errorMessage(err))
      setSaving(false)
    }
  }

  const errorProps = (field) =>
    fieldErrors[field] ? { 'aria-invalid': true, 'aria-describedby': `category-${field}-error` } : {}
  const fieldError = (field) =>
    fieldErrors[field] && (
      <span id={`category-${field}-error`} className="field__hint field__hint--error">
        {fieldErrors[field]}
      </span>
    )

  return (
    <Modal
      title={isEdit ? `Edit ${category.name}` : 'Add category'}
      onClose={saving ? undefined : onCancel}
      returnFocusRef={returnFocusRef}
      footer={
        <>
          <button type="button" className="btn btn--secondary" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
          <button type="submit" form="category-form" className="btn btn--primary" disabled={saving || unchanged}>
            {saving ? (
              <LoaderCircle size={16} className="spin" aria-hidden="true" />
            ) : isEdit ? (
              <Save size={16} aria-hidden="true" />
            ) : (
              <Plus size={16} aria-hidden="true" />
            )}
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add category'}
          </button>
        </>
      }
    >
      <form id="category-form" className="form" onSubmit={handleSubmit} noValidate>
        {error && <Alert>{error}</Alert>}
        <div className="field">
          <label htmlFor="category-name">Name</label>
          <input
            id="category-name"
            className="input"
            value={name}
            maxLength={NAME_MAX}
            onChange={(e) => {
              setName(e.target.value)
              setFieldErrors((current) => ({ ...current, name: undefined }))
            }}
            autoComplete="off"
            required
            data-autofocus
            {...errorProps('name')}
          />
          {fieldError('name')}
        </div>
        <div className="field">
          <label htmlFor="category-description">
            Description <span className="field__optional">Optional</span>
          </label>
          <textarea
            id="category-description"
            className="textarea"
            rows={3}
            value={description}
            maxLength={DESCRIPTION_MAX}
            onChange={(e) => {
              setDescription(e.target.value)
              setFieldErrors((current) => ({ ...current, description: undefined }))
            }}
            {...errorProps('description')}
          />
          {fieldError('description')}
        </div>
      </form>
    </Modal>
  )
}
