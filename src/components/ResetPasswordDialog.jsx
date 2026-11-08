// ResetPasswordDialog.jsx – asks before resetting someone's password (POST /users/:id/reset-password),
// because their current password stops working at once. On success it hands { user, temporaryPassword } to onReset.
import { KeyRound, LoaderCircle } from 'lucide-react'
import { useState } from 'react'
import client, { errorMessage } from '../api/client'
import Modal from './Modal'
import { Alert } from './Ui'

export default function ResetPasswordDialog({ user, onReset, onCancel, returnFocusRef }) {
  const [resetting, setResetting] = useState(false)
  const [error, setError] = useState('')

  async function reset() {
    setResetting(true)
    setError('')
    try {
      const { data } = await client.post(`/users/${user.id}/reset-password`)
      onReset(data)
    } catch (err) {
      setError(errorMessage(err))
      setResetting(false)
    }
  }

  return (
    <Modal
      title="Reset password"
      role="alertdialog"
      // Not while the request runs: closing then would lose the new one-time password
      onClose={resetting ? undefined : onCancel}
      returnFocusRef={returnFocusRef}
      footer={
        <>
          <button type="button" className="btn btn--secondary" onClick={onCancel} disabled={resetting} data-autofocus>
            Cancel
          </button>
          <button type="button" className="btn btn--primary" onClick={reset} disabled={resetting}>
            {resetting ? <LoaderCircle size={16} className="spin" aria-hidden="true" /> : <KeyRound size={16} aria-hidden="true" />}
            {resetting ? 'Resetting…' : 'Reset password'}
          </button>
        </>
      }
    >
      <div className="form">
        {error && <Alert>{error}</Alert>}
        <p>
          Reset {user.name}&apos;s password? Their current password stops working immediately.
        </p>
      </div>
    </Modal>
  )
}
