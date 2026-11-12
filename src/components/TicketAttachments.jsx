// TicketAttachments.jsx – the "Attachments" card on a ticket's page.
// Lists the files (icon, name, size, who added them and when) with a Download link, and a Delete button for whoever
// uploaded a file or an admin (with a confirm dialog). Everyone who can see the ticket (the requester and staff) can
// add files with the dropzone. Files that failed to upload, here or right after creating the ticket (New ticket passes
// them as navigation state, `failedUploads`), are listed with "Try again".
import { Download, LoaderCircle, RotateCcw, Trash2, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { deleteAttachment, downloadUrl, uploadFiles } from '../api/attachments'
import { errorMessage } from '../api/client'
import { useAuth } from '../context/auth'
import {
  MAX_FILES_PER_TICKET,
  MAX_FILES_PER_UPLOAD,
  attachmentIcon,
  canDeleteAttachment,
  formatBytes,
} from '../utils/attachments'
import { formatDate, timeAgo } from '../utils/format'
import AttachmentDropzone from './AttachmentDropzone'
import Modal from './Modal'
import { Alert } from './Ui'
import UploadStatusList from './UploadStatusList'

export default function TicketAttachments({ ticket, reload }) {
  const { user } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const attachments = ticket.attachments ?? []

  const [chosen, setChosen] = useState([])
  const [uploads, setUploads] = useState(null) // the upload running now (UploadStatusList entries)
  // Files that didn't upload: [{ file, error }]. Starts with any New ticket handed over, read once.
  const [failed, setFailed] = useState(() => location.state?.failedUploads ?? [])
  const [toDelete, setToDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const deleteTrigger = useRef(null)

  // Forget the handed-over failures in the browser history (they're in `failed` now), so a reload or Back doesn't
  // show them again
  useEffect(() => {
    if (location.state?.failedUploads) navigate(location.pathname, { replace: true, state: null })
  }, [location, navigate])

  const room = Math.max(0, MAX_FILES_PER_TICKET - attachments.length)
  const busy = uploads !== null

  async function upload(files) {
    setUploads(files.map((file) => ({ name: file.name, status: 'waiting' })))
    const results = await uploadFiles(ticket.id, files, (index, change) =>
      setUploads((current) => current.map((entry, i) => (i === index ? { ...entry, ...change } : entry))),
    )
    setUploads(null)
    await reload()
    return results.filter((result) => result.error)
  }

  async function uploadChosen() {
    const files = chosen
    setChosen([])
    const stillFailed = await upload(files)
    setFailed((current) => [...current, ...stillFailed])
  }

  async function retryFailed() {
    const files = failed.map((entry) => entry.file)
    setFailed([])
    setFailed(await upload(files))
  }

  async function confirmDelete() {
    setDeleting(true)
    setDeleteError('')
    try {
      await deleteAttachment(toDelete.id)
      setToDelete(null)
      await reload()
    } catch (err) {
      setDeleteError(errorMessage(err))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <section className="card card--padded" aria-labelledby="attachments-title">
      <h2 id="attachments-title" className="panel-title">
        Attachments ({attachments.length})
      </h2>

      {failed.length > 0 && !busy && (
        <Alert tone="warning">
          <p>{failed.length === 1 ? "This file wasn't uploaded:" : `These ${failed.length} files weren't uploaded:`}</p>
          <ul className="upload-failures">
            {failed.map(({ file, error }) => (
              <li key={`${file.name}-${file.size}-${file.lastModified}`}>{error}</li>
            ))}
          </ul>
          <div className="button-row">
            <button type="button" className="btn btn--sm btn--secondary" onClick={retryFailed} disabled={room === 0}>
              <RotateCcw size={14} aria-hidden="true" />
              Try again
            </button>
            <button type="button" className="btn btn--sm btn--secondary" onClick={() => setFailed([])}>
              Dismiss
            </button>
          </div>
        </Alert>
      )}

      {attachments.length === 0 ? (
        <p className="comments__empty">No files attached yet.</p>
      ) : (
        <ul className="attachment-list">
          {attachments.map((attachment) => {
            const Icon = attachmentIcon(attachment.mime_type)
            return (
              <li key={attachment.id} className="attachment-list__item">
                <Icon size={20} aria-hidden="true" className="attachment-list__icon" />
                <div className="attachment-list__text">
                  <span className="attachment-list__name">{attachment.original_name}</span>
                  <span className="attachment-list__meta">
                    {formatBytes(attachment.size_bytes)} · {attachment.uploaded_by.name} ·{' '}
                    <time dateTime={attachment.created_at} title={formatDate(attachment.created_at)}>
                      {timeAgo(attachment.created_at)}
                    </time>
                  </span>
                </div>
                <div className="attachment-list__actions">
                  <a
                    className="btn btn--sm btn--secondary"
                    href={downloadUrl(attachment.id)}
                    download={attachment.original_name}
                    aria-label={`Download ${attachment.original_name}`}
                  >
                    <Download size={14} aria-hidden="true" />
                    <span className="attachment-list__action-text">Download</span>
                  </a>
                  {canDeleteAttachment(user, attachment) && (
                    <button
                      type="button"
                      className="btn btn--sm btn--secondary"
                      onClick={(event) => {
                        deleteTrigger.current = event.currentTarget
                        setDeleteError('')
                        setToDelete(attachment)
                      }}
                      aria-label={`Delete ${attachment.original_name}`}
                    >
                      <Trash2 size={14} aria-hidden="true" />
                      <span className="attachment-list__action-text">Delete</span>
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <div className="attachments__add">
        {busy ? (
          <UploadStatusList uploads={uploads} label="Uploading attachments" />
        ) : room === 0 ? (
          <p className="field__hint">This ticket has the maximum of {MAX_FILES_PER_TICKET} attachments.</p>
        ) : (
          <>
            <AttachmentDropzone
              label="Add files"
              files={chosen}
              onChange={setChosen}
              max={Math.min(MAX_FILES_PER_UPLOAD, room)}
            />
            {chosen.length > 0 && (
              <div className="form__actions">
                <button type="button" className="btn btn--primary" onClick={uploadChosen}>
                  <Upload size={16} aria-hidden="true" />
                  Upload {chosen.length === 1 ? '1 file' : `${chosen.length} files`}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {toDelete && (
        <Modal
          title="Delete attachment"
          role="alertdialog"
          onClose={deleting ? undefined : () => setToDelete(null)}
          returnFocusRef={deleteTrigger}
          footer={
            <>
              <button
                type="button"
                className="btn btn--secondary"
                onClick={() => setToDelete(null)}
                disabled={deleting}
                data-autofocus
              >
                Cancel
              </button>
              <button type="button" className="btn btn--danger" onClick={confirmDelete} disabled={deleting}>
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
            {deleteError && <Alert>{deleteError}</Alert>}
            <p>Delete {toDelete.original_name}? This can&apos;t be undone.</p>
          </div>
        </Modal>
      )}
    </section>
  )
}
