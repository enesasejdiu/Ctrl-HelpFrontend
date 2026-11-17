// draftBackup.js – the knowledge-base editor's local copy of an article being written (KbEditor.jsx), so changes that
// weren't saved can be offered back after a crash or a closed tab. One entry per article: the editor's fields, when
// they were copied, and the updated_at they were based on. Article text only.
//
// The only module allowed to use localStorage (test/no-token-storage.test.js checks it keeps to its own keys). Storage
// can be missing or full (private windows, quotas): the copy is a convenience, so every failure is ignored.
export const DRAFT_BACKUP_PREFIX = 'kb-editor-backup:'

// id: the article's id, or 'new' for one not saved yet
const keyFor = (id) => `${DRAFT_BACKUP_PREFIX}${id}`

export function readDraftBackup(id) {
  try {
    return JSON.parse(window.localStorage.getItem(keyFor(id)))
  } catch {
    return null
  }
}

export function writeDraftBackup(id, value) {
  try {
    window.localStorage.setItem(keyFor(id), JSON.stringify(value))
  } catch {
    // Ignored: the editor works without a copy
  }
}

export function removeDraftBackup(id) {
  try {
    window.localStorage.removeItem(keyFor(id))
  } catch {
    // Ignored
  }
}
