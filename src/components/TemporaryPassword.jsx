// TemporaryPassword.jsx – shows a temporary password the server just made (new account or reset), with a copy button.
// The server returns it only once and stores only its hash, so after "Done" it can't be shown again.
import { Check, Copy, KeyRound } from 'lucide-react'
import { useState } from 'react'

export default function TemporaryPassword({ user, password, reason, onDone }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(password)
      setCopied(true)
    } catch {
      // No clipboard access (e.g. plain http): the password is selectable, so it can still be copied by hand
    }
  }

  return (
    <div className="temp-password" role="status">
      <KeyRound size={18} className="temp-password__icon" aria-hidden="true" />
      <div className="temp-password__body">
        <p className="temp-password__title">
          {reason === 'reset' ? `Password reset for ${user.name}` : `Account created for ${user.name}`}
        </p>
        <p className="temp-password__text">
          Give {user.email} this temporary password in person or another safe way. It is shown only once; they will
          choose their own password when they sign in.
        </p>
        <div className="temp-password__row">
          <code className="temp-password__value" aria-label="Temporary password">
            {password}
          </code>
          <button type="button" className="btn btn--secondary btn--sm" onClick={copy}>
            {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button type="button" className="btn btn--primary btn--sm" onClick={onDone}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
