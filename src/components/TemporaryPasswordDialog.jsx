// TemporaryPasswordDialog.jsx – shows a temporary password (new account or reset), the only time it is ever available.
// It closes only with its button (not Escape), so the password isn't lost by an accidental key press.
// The parent clears the password from its state in onClose.
import { Check, Copy, TriangleAlert } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import Modal from './Modal'

const COPIED_MS = 2000

// `title` defaults to "<name>'s account is ready" (after Add user); a reset passes "New password for <name>"
export default function TemporaryPasswordDialog({ name, email, password, title, onClose, returnFocusRef }) {
  const [copyState, setCopyState] = useState('idle') // 'idle' | 'copied' | 'failed'
  const timer = useRef(null)

  // Don't leave a timer running after the dialog has closed
  useEffect(() => () => clearTimeout(timer.current), [])

  async function copy() {
    clearTimeout(timer.current)
    try {
      await navigator.clipboard.writeText(password)
      setCopyState('copied')
      timer.current = setTimeout(() => setCopyState('idle'), COPIED_MS)
    } catch {
      // No clipboard access (e.g. an insecure page or a denied permission): the password can still be selected
      setCopyState('failed')
    }
  }

  return (
    <Modal
      title={title ?? `${name}'s account is ready`}
      role="alertdialog"
      returnFocusRef={returnFocusRef}
      footer={
        <button type="button" className="btn btn--primary" onClick={onClose}>
          Done
        </button>
      }
    >
      <div className="form">
        <dl className="info-list">
          <div>
            <dt>Email</dt>
            <dd>{email}</dd>
          </div>
        </dl>

        <div className="field">
          <span className="field__label">Temporary password</span>
          <div className="secret">
            <code className="secret__value">{password}</code>
            <button type="button" className="btn btn--secondary btn--sm" onClick={copy} data-autofocus>
              {copyState === 'copied' ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
              {copyState === 'copied' ? 'Copied' : 'Copy'}
            </button>
          </div>
          {copyState === 'failed' && (
            <span className="field__hint field__hint--error" role="alert">
              Couldn't copy. Select the password and copy it by hand.
            </span>
          )}
        </div>

        <div className="notice notice--warning" role="note">
          <TriangleAlert size={18} aria-hidden="true" />
          <p>
            This password is shown only once. Give it to the user securely; they must change it at first login.
          </p>
        </div>
      </div>
    </Modal>
  )
}
