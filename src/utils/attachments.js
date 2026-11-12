// attachments.js – the rules for ticket attachments as the browser checks them, and small display helpers.
// The backend has the final say (it checks each file's real content, not just its name); these checks only catch the
// obvious mistakes before anything is sent. The numbers match the backend README, "Attachments".
import { File, FileImage, FileSpreadsheet, FileText } from 'lucide-react'

export const ALLOWED_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'pdf', 'txt', 'log', 'csv']
export const MAX_FILE_BYTES = 10 * 1024 * 1024 // 10 MB per file
export const MAX_FILES_PER_UPLOAD = 5
export const MAX_FILES_PER_TICKET = 20

// For the file picker, so it offers the allowed types first
export const ACCEPT = ALLOWED_EXTENSIONS.map((extension) => `.${extension}`).join(',')

const extensionOf = (name) => /\.([^.]+)$/.exec(name)?.[1].toLowerCase() ?? ''

// 48213 → "47.1 KB", 10485760 → "10 MB", 900 → "900 bytes"
export function formatBytes(bytes) {
  const format = (value, unit) => `${Number.isInteger(value) ? value : value.toFixed(1)} ${unit}`
  if (bytes >= 1024 * 1024) return format(bytes / (1024 * 1024), 'MB')
  if (bytes >= 1024) return format(bytes / 1024, 'KB')
  return `${bytes} ${bytes === 1 ? 'byte' : 'bytes'}`
}

// Why the browser refuses a file before uploading, or null when it may be sent
export function fileProblem(file) {
  if (!ALLOWED_EXTENSIONS.includes(extensionOf(file.name))) return `${file.name}: this file type isn't allowed`
  if (file.size > MAX_FILE_BYTES) return `${file.name} is larger than ${formatBytes(MAX_FILE_BYTES)}`
  if (file.size === 0) return `${file.name} is empty`
  return null
}

// An icon that says what kind of file it is (by the type the backend found in the content)
export function attachmentIcon(mimeType = '') {
  if (mimeType.startsWith('image/')) return FileImage
  if (mimeType === 'text/csv') return FileSpreadsheet
  if (mimeType === 'application/pdf' || mimeType.startsWith('text/')) return FileText
  return File
}

// Who may delete an attachment: whoever uploaded it, or an admin (the backend checks the same)
export function canDeleteAttachment(user, attachment) {
  return Boolean(user) && (user.role === 'admin' || attachment.uploaded_by?.id === user.id)
}
