// Modal.jsx – a dialog on top of the page, used by the Users page.
// Keyboard: Tab stays inside the dialog, Escape closes it (only when `onClose` is given), and when it closes focus
// goes back to whatever opened it. Mark the control that should get focus first with data-autofocus
// (otherwise the first focusable one gets it).
import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * @param title    heading text, also the dialog's accessible name
 * @param onClose  called on Escape; leave it out while the dialog must stay open (e.g. during a save)
 * @param footer   buttons, shown in a bar under the content
 * @param role     'dialog' (default) or 'alertdialog' for something the user must acknowledge
 * @param returnFocusRef  where focus goes on close (default: whatever had focus when the dialog opened)
 */
export default function Modal({ title, onClose, footer, role = 'dialog', returnFocusRef, children }) {
  const titleId = useId()
  const panel = useRef(null)
  // What had focus when the dialog opened, read during the first render, before focus moves into the dialog
  const [opener] = useState(() => document.activeElement)

  // Move focus into the dialog, stop the page behind from scrolling, and give focus back on close.
  // The first focus is set here, not with autoFocus: in development React's StrictMode runs this effect, its
  // cleanup, and the effect again, and the cleanup would otherwise leave focus back on the opener.
  useEffect(() => {
    const first = panel.current.querySelector('[data-autofocus]') ?? panel.current.querySelector(FOCUSABLE)
    first?.focus()
    const target = returnFocusRef?.current ?? opener
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = overflow
      if (target instanceof HTMLElement && target.isConnected) target.focus()
    }
  }, [opener, returnFocusRef])

  function handleKeyDown(event) {
    if (event.key === 'Escape' && onClose) {
      event.stopPropagation()
      onClose()
      return
    }
    // Focus trap: Tab on the last control wraps to the first one, Shift+Tab on the first wraps to the last
    if (event.key !== 'Tab') return
    const items = [...panel.current.querySelectorAll(FOCUSABLE)]
    if (items.length === 0) return
    const first = items[0]
    const last = items.at(-1)
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  // Rendered at the end of <body>, so no card's overflow or stacking can clip it
  return createPortal(
    <div className="modal-backdrop">
      <div
        ref={panel}
        className="modal"
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={handleKeyDown}
      >
        <h2 id={titleId} className="modal__title">
          {title}
        </h2>
        <div className="modal__body">{children}</div>
        {footer && <div className="modal__footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}
