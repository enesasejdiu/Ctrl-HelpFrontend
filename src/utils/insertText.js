// insertText.js – puts text into a textarea at the cursor, or over the selection, the way typing would: the browser's
// undo (Ctrl+Z) takes it out again, React's onChange sees the new value, and the cursor ends up right after it.
//
// document.execCommand('insertText') is what keeps undo working in Chrome, Edge, Firefox and Safari. It is deprecated
// but has no replacement for this; where it isn't available (or refuses), setRangeText is used, followed by an input
// event so React's onChange runs (undo may then not include the insertion).

// from / to: the range to replace (default: the current selection)
export function insertText(textarea, text, { from = textarea.selectionStart, to = textarea.selectionEnd } = {}) {
  textarea.focus()
  textarea.setSelectionRange(from, to)
  const inserted = typeof document.execCommand === 'function' && document.execCommand('insertText', false, text)
  if (!inserted) {
    textarea.setRangeText(text, from, to, 'end')
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
  }
  // Right after the inserted text, whichever way it went in
  const cursor = from + text.length
  textarea.setSelectionRange(cursor, cursor)
}
