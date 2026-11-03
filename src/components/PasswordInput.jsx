// PasswordInput.jsx – password field with a show/hide toggle.
import { Eye, EyeOff } from 'lucide-react'
import { useState } from 'react'

export default function PasswordInput(props) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="input-group">
      <input {...props} type={visible ? 'text' : 'password'} className="input" />
      <button
        type="button"
        className="input-group__button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Hide password' : 'Show password'}
      >
        {visible ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
      </button>
    </div>
  )
}
