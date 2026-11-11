// DeleteDepartmentDialog.jsx – asks before deleting a department (DELETE /departments/:id).
// The page only offers this for an empty department, but someone may have put a user in it since the list loaded:
// then the backend refuses with 409 DEPARTMENT_NOT_EMPTY and its message is shown here, and onRefused gets the
// current user_count so the page can update the row.
import { LoaderCircle, Trash2 } from 'lucide-react'
import { useState } from 'react'
import client, { errorMessage } from '../api/client'
import Modal from './Modal'
import { Alert } from './Ui'

export default function DeleteDepartmentDialog({ department, onDeleted, onRefused, onCancel, returnFocusRef }) {
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')
  const [refused, setRefused] = useState(false)

  async function remove() {
    setDeleting(true)
    setError('')
    try {
      await client.delete(`/departments/${department.id}`)
      onDeleted(department)
    } catch (err) {
      setError(errorMessage(err))
      const data = err.response?.data
      if (data?.code === 'DEPARTMENT_NOT_EMPTY') {
        setRefused(true)
        if (data.user_count) onRefused?.(department, data.user_count)
      }
      setDeleting(false)
    }
  }

  return (
    <Modal
      title="Delete department"
      role="alertdialog"
      onClose={deleting ? undefined : onCancel}
      returnFocusRef={returnFocusRef}
      footer={
        <>
          <button type="button" className="btn btn--secondary" onClick={onCancel} disabled={deleting} data-autofocus>
            Cancel
          </button>
          <button type="button" className="btn btn--danger" onClick={remove} disabled={deleting || refused}>
            {deleting ? (
              <LoaderCircle size={16} className="spin" aria-hidden="true" />
            ) : (
              <Trash2 size={16} aria-hidden="true" />
            )}
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </>
      }
    >
      <div className="form">
        {error && <Alert>{error}</Alert>}
        <p>Delete {department.name}? This can&apos;t be undone.</p>
      </div>
    </Modal>
  )
}
