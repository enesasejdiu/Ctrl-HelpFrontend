// attachments.js – ticket attachment requests (backend README, "Attachments").
// Files are uploaded ONE PER REQUEST: the backend refuses a whole request if one file in it is refused, and uploading
// them one by one lets each file succeed or fail on its own, with its own progress.
import client, { errorMessage } from './client'
import { formatBytes } from '../utils/attachments'

// A link straight to the file. The browser sends the session cookie with it, and the backend always answers with
// Content-Disposition: attachment, so it downloads instead of opening.
export function downloadUrl(attachmentId) {
  return `${client.defaults.baseURL}/attachments/${attachmentId}/download`
}

// What went wrong with one file, as a sentence that names it
export function uploadErrorMessage(file, err) {
  const data = err?.response?.data
  if (data?.code === 'FILE_TOO_LARGE' && data.max_bytes)
    return `${file.name} is larger than ${formatBytes(data.max_bytes)}`
  const message = errorMessage(err)
  // Most backend messages already name the file ("photo.png: this file type isn't allowed"); add it when they don't
  return message.includes(file.name) ? message : `${file.name}: ${message}`
}

// Uploads one file; onProgress(0–100) while it's sent. Resolves to the new attachment.
export async function uploadFile(ticketId, file, onProgress) {
  const form = new FormData()
  form.append('files', file, file.name)
  const { data } = await client.post(`/tickets/${ticketId}/attachments`, form, {
    onUploadProgress: (event) => {
      if (event.total) onProgress?.(Math.min(100, Math.round((event.loaded / event.total) * 100)))
    },
  })
  return data[0]
}

// Uploads the files one after another. onChange(index, { status, progress, error }) reports each one
// (status: 'uploading' | 'done' | 'failed'). Resolves to [{ file, attachment } | { file, error }], in order.
export async function uploadFiles(ticketId, files, onChange) {
  const results = []
  for (const [index, file] of files.entries()) {
    onChange?.(index, { status: 'uploading', progress: 0 })
    try {
      const attachment = await uploadFile(ticketId, file, (progress) =>
        onChange?.(index, { status: 'uploading', progress }),
      )
      onChange?.(index, { status: 'done', progress: 100 })
      results.push({ file, attachment })
    } catch (err) {
      const error = uploadErrorMessage(file, err)
      onChange?.(index, { status: 'failed', error })
      results.push({ file, error })
    }
  }
  return results
}

export function deleteAttachment(attachmentId) {
  return client.delete(`/attachments/${attachmentId}`)
}
