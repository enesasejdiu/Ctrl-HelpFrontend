// UploadStatusList.jsx – how each file of an upload is doing: a progress bar while it's sent, then "Uploaded" or the
// reason it failed. `uploads`: [{ name, status: 'waiting' | 'uploading' | 'done' | 'failed', progress, error }].
import { CircleAlert, CircleCheck, LoaderCircle } from 'lucide-react'

export default function UploadStatusList({ uploads, label = 'Upload progress' }) {
  if (uploads.length === 0) return null
  return (
    <ul className="upload-list" aria-label={label}>
      {uploads.map((upload, index) => (
        <li key={`${upload.name}-${index}`} className={`upload-list__item upload-list__item--${upload.status}`}>
          <span className="upload-list__name">{upload.name}</span>
          {upload.status === 'waiting' && <span className="upload-list__state">Waiting…</span>}
          {upload.status === 'uploading' && (
            <span className="upload-list__state">
              <LoaderCircle size={14} className="spin" aria-hidden="true" />
              <progress
                className="upload-list__bar"
                max={100}
                value={upload.progress ?? 0}
                aria-label={`Uploading ${upload.name}`}
              />
              <span aria-hidden="true">{upload.progress ?? 0}%</span>
            </span>
          )}
          {upload.status === 'done' && (
            <span className="upload-list__state">
              <CircleCheck size={14} aria-hidden="true" />
              Uploaded
            </span>
          )}
          {upload.status === 'failed' && (
            <span className="upload-list__state upload-list__state--error">
              <CircleAlert size={14} aria-hidden="true" />
              {upload.error}
            </span>
          )}
        </li>
      ))}
    </ul>
  )
}
