// AttachmentDropzone.jsx – choose files to attach: drag and drop, or click (or Enter/Space) to open the file picker.
// Shows the chosen files with their size and a Remove button. Each file is checked in the browser first (type, size;
// see utils/attachments.js) and a refused one gets its own message instead of being added. The parent holds the list
// (`files`, `onChange`) and does the upload; the backend checks every file again.
import { Paperclip, X } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import {
  ACCEPT,
  MAX_FILES_PER_UPLOAD,
  MAX_FILE_BYTES,
  attachmentIcon,
  fileProblem,
  formatBytes,
} from '../utils/attachments'

const sameFile = (a, b) => a.name === b.name && a.size === b.size && a.lastModified === b.lastModified

// A file's type as the picker reports it, for the icon (the backend decides the real one)
const typeOf = (file) => file.type || (/\.csv$/i.test(file.name) ? 'text/csv' : '')

/**
 * @param files     the chosen File objects
 * @param onChange  called with the new list
 * @param max       how many files may be chosen (at most 5 per upload; fewer when the ticket is nearly full)
 * @param disabled  e.g. while uploading
 * @param label     the visible label above the zone
 */
export default function AttachmentDropzone({ files, onChange, max = MAX_FILES_PER_UPLOAD, disabled = false, label }) {
  const id = useId()
  const [problems, setProblems] = useState([])
  const [dragging, setDragging] = useState(false)
  // dragenter/dragleave also fire for the zone's children; count them so the highlight doesn't flicker
  const dragDepth = useRef(0)

  function add(list) {
    const next = [...files]
    const refused = []
    for (const file of list) {
      const problem = fileProblem(file)
      if (problem) refused.push(problem)
      else if (next.some((chosen) => sameFile(chosen, file))) continue
      else if (next.length >= max)
        refused.push(`${file.name}: you can add at most ${max} ${max === 1 ? 'file' : 'files'} here`)
      else next.push(file)
    }
    setProblems(refused)
    if (next.length !== files.length) onChange(next)
  }

  function remove(index) {
    setProblems([])
    onChange(files.filter((_, i) => i !== index))
  }

  function handlePick(event) {
    add([...event.target.files])
    // Lets the same file be picked again after removing it
    event.target.value = ''
  }

  function handleDrop(event) {
    event.preventDefault()
    dragDepth.current = 0
    setDragging(false)
    if (!disabled) add([...event.dataTransfer.files])
  }

  const dragHandlers = {
    onDragEnter: (event) => {
      event.preventDefault()
      dragDepth.current += 1
      if (!disabled) setDragging(true)
    },
    onDragOver: (event) => event.preventDefault(), // needed for the drop to be allowed at all
    onDragLeave: () => {
      dragDepth.current -= 1
      if (dragDepth.current <= 0) setDragging(false)
    },
    onDrop: handleDrop,
  }

  const hintId = `${id}-hint`
  const full = files.length >= max

  return (
    <div className="dropzone-field">
      {label && (
        <span className="field__label" id={`${id}-label`}>
          {label} <span className="field__optional">Optional</span>
        </span>
      )}
      <div
        className={`dropzone${dragging ? ' is-dragging' : ''}${disabled || full ? ' is-disabled' : ''}`}
        data-testid="dropzone"
        {...dragHandlers}
      >
        <input
          id={id}
          type="file"
          multiple
          accept={ACCEPT}
          className="dropzone__input"
          onChange={handlePick}
          disabled={disabled || full}
          aria-labelledby={label ? `${id}-label ${id}-action` : `${id}-action`}
          aria-describedby={hintId}
        />
        <label htmlFor={id} className="dropzone__label">
          <Paperclip size={20} aria-hidden="true" />
          <span id={`${id}-action`}>
            <strong>Choose files</strong> or drag them here
          </span>
          <span id={hintId} className="dropzone__hint">
            PNG, JPG, GIF, WebP, PDF, TXT, LOG or CSV · up to {formatBytes(MAX_FILE_BYTES)} each · {max}{' '}
            {max === 1 ? 'file' : 'files'} at most
          </span>
        </label>
      </div>

      {problems.length > 0 && (
        <ul className="dropzone__problems" role="alert">
          {problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      )}

      {files.length > 0 && (
        <ul className="file-list" aria-label="Chosen files">
          {files.map((file, index) => {
            const Icon = attachmentIcon(typeOf(file))
            return (
              <li key={`${file.name}-${file.size}-${file.lastModified}`} className="file-list__item">
                <Icon size={18} aria-hidden="true" className="file-list__icon" />
                <span className="file-list__name">{file.name}</span>
                <span className="file-list__meta">{formatBytes(file.size)}</span>
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => remove(index)}
                  disabled={disabled}
                  aria-label={`Remove ${file.name}`}
                  title="Remove"
                >
                  <X size={16} aria-hidden="true" />
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
