// DepartmentDialog.jsx – the "Add department" and "Rename department" form on the Departments page.
// Add (no `department`): POST /departments. Rename (`department` given): prefilled, PATCH /departments/:id.
// Either way the saved department (with its user_count) goes to onSaved. A name that's taken (any letter case)
// comes back as 409 and is shown under the field.
import { LoaderCircle, Plus, Save } from 'lucide-react'
import { useState } from 'react'
import client, { errorMessage } from '../api/client'
import Modal from './Modal'
import { Alert } from './Ui'

// The backend trims the name and collapses runs of spaces, so compare and check the same way
const clean = (name) => name.trim().replace(/\s+/g, ' ')

export default function DepartmentDialog({ department = null, onSaved, onCancel, returnFocusRef }) {
  const isRename = department !== null
  const [name, setName] = useState(department?.name ?? '')
  const [nameError, setNameError] = useState('')
  const [error, setError] = useState('') // anything that isn't about the name
  const [saving, setSaving] = useState(false)
  const unchanged = isRename && clean(name) === department.name

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    if (!clean(name)) {
      setNameError('Name is required')
      return
    }
    if (unchanged) return

    setSaving(true)
    try {
      const { data } = isRename
        ? await client.patch(`/departments/${department.id}`, { name: clean(name) })
        : await client.post('/departments', { name: clean(name) })
      onSaved(data)
    } catch (err) {
      const status = err.response?.status
      const fieldMessage = err.response?.data?.errors?.find((e) => e.field === 'name')?.message
      if (status === 409) setNameError(errorMessage(err))
      else if (status === 400 && fieldMessage) setNameError(fieldMessage)
      else setError(errorMessage(err))
      setSaving(false)
    }
  }

  const SubmitIcon = isRename ? Save : Plus
  let submitLabel = isRename ? 'Rename' : 'Add department'
  if (saving) submitLabel = 'Saving…'

  return (
    <Modal
      title={isRename ? `Rename ${department.name}` : 'Add department'}
      onClose={saving ? undefined : onCancel}
      returnFocusRef={returnFocusRef}
      footer={
        <>
          <button type="button" className="btn btn--secondary" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
          <button type="submit" form="department-form" className="btn btn--primary" disabled={saving || unchanged}>
            {saving ? (
              <LoaderCircle size={16} className="spin" aria-hidden="true" />
            ) : (
              <SubmitIcon size={16} aria-hidden="true" />
            )}
            {submitLabel}
          </button>
        </>
      }
    >
      <form id="department-form" className="form" onSubmit={handleSubmit} noValidate>
        {error && <Alert>{error}</Alert>}
        <div className="field">
          <label htmlFor="department-name">Name</label>
          <input
            id="department-name"
            className="input"
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setNameError('')
            }}
            maxLength={100}
            autoComplete="off"
            required
            data-autofocus
            {...(nameError && { 'aria-invalid': true, 'aria-describedby': 'department-name-error' })}
          />
          {nameError && (
            <span id="department-name-error" className="field__hint field__hint--error">
              {nameError}
            </span>
          )}
        </div>
      </form>
    </Modal>
  )
}
