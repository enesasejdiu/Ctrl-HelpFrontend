// canned.js – the canned-response fields as the browser checks them before saving (the same limits as the backend's
// schemas/cannedResponses.js; the server's check is the one that counts).
import { CANNED_BODY_MAX, CANNED_TITLE_MAX } from '../api/cannedResponses'
import { t } from '../i18n'

// { field: message } for each field that breaks a rule (empty when all is fine)
export function validateCanned({ title, body }) {
  const errors = {}
  const cleanTitle = title.trim()
  if (!cleanTitle) errors.title = t('canned.error.titleRequired')
  else if (cleanTitle.length > CANNED_TITLE_MAX) errors.title = t('canned.error.titleLong', { max: CANNED_TITLE_MAX })
  if (!body.trim()) errors.body = t('canned.error.bodyRequired')
  else if (body.length > CANNED_BODY_MAX) errors.body = t('canned.error.bodyLong', { max: CANNED_BODY_MAX })
  return errors
}
