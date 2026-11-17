// CannedResponseDialog.jsx – create or edit a canned response: title (counter), text (counter, placeholders to click
// in at the cursor), and "Shared with all staff" (admins, when creating). Checks before saving; the server's messages
// (422, 409 TITLE_TAKEN) show under their field. Whether a response is shared can't change after it is created.
import { LoaderCircle, Save } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import {
  CANNED_BODY_MAX,
  CANNED_TITLE_MAX,
  createCannedResponse,
  updateCannedResponse,
} from '../../api/cannedResponses'
import { errorMessage } from '../../api/client'
import { fieldErrors } from '../../api/kb'
import { t } from '../../i18n'
import { validateCanned } from '../../utils/canned'
import { insertText } from '../../utils/insertText'
import { PLACEHOLDERS } from '../../utils/placeholders'
import Modal from '../Modal'
import { Alert } from '../Ui'

/**
 * @param response       the response to edit, or null to create one
 * @param canShare       the user is an admin (may create shared responses)
 * @param sharedDefault  "Shared with all staff" ticked at first (creating from the Shared tab)
 */
export default function CannedResponseDialog({ response, canShare, sharedDefault, onClose, onSaved, returnFocusRef }) {
  const id = useId()
  const bodyRef = useRef(null)
  const [form, setForm] = useState({
    title: response?.title ?? '',
    body: response?.body ?? '',
    shared: response ? response.shared : Boolean(canShare && sharedDefault),
  })
  const [errors, setErrors] = useState({})
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const set = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }))

  async function handleSubmit(event) {
    event.preventDefault()
    const problems = validateCanned(form)
    setErrors(problems)
    setError(Object.keys(problems).length > 0 ? t('canned.dialog.fixFields') : '')
    if (Object.keys(problems).length > 0) return
    setSaving(true)
    const fields = { title: form.title.trim(), body: form.body }
    try {
      const saved = response
        ? await updateCannedResponse(response.id, fields)
        : await createCannedResponse({ ...fields, shared: form.shared })
      onSaved(saved)
    } catch (err) {
      const byField = fieldErrors(err)
      if (err.response?.data?.code === 'TITLE_TAKEN') byField.title = errorMessage(err)
      setErrors(byField)
      setError(Object.keys(byField).length > 0 ? t('canned.dialog.fixFields') : errorMessage(err))
      setSaving(false)
    }
  }

  const describedBy = (field, ...more) =>
    [errors[field] && `${id}-${field}-error`, ...more].filter(Boolean).join(' ') || undefined

  return (
    <Modal
      title={response ? t('canned.dialog.edit') : t('canned.dialog.new')}
      onClose={saving ? undefined : onClose}
      returnFocusRef={returnFocusRef}
      footer={
        <>
          <button type="button" className="btn btn--secondary" onClick={onClose} disabled={saving}>
            {t('canned.dialog.cancel')}
          </button>
          <button type="submit" form={`${id}-form`} className="btn btn--primary" disabled={saving}>
            {saving ? (
              <LoaderCircle size={16} className="spin" aria-hidden="true" />
            ) : (
              <Save size={16} aria-hidden="true" />
            )}
            {saving ? t('canned.dialog.saving') : t('canned.dialog.save')}
          </button>
        </>
      }
    >
      <form id={`${id}-form`} className="form" onSubmit={handleSubmit} noValidate>
        {error && <Alert>{error}</Alert>}

        <div className="field">
          <label htmlFor={`${id}-title`}>
            {t('canned.dialog.title')}
            <span className="field__counter" aria-hidden="true">
              {form.title.length}/{CANNED_TITLE_MAX}
            </span>
          </label>
          <input
            id={`${id}-title`}
            className="input"
            value={form.title}
            maxLength={CANNED_TITLE_MAX}
            onChange={set('title')}
            aria-invalid={errors.title ? true : undefined}
            aria-describedby={describedBy('title')}
            data-autofocus
          />
          {errors.title && (
            <span id={`${id}-title-error`} className="field__hint field__hint--error">
              {errors.title}
            </span>
          )}
        </div>

        <div className="field">
          <label htmlFor={`${id}-body`}>
            {t('canned.dialog.body')}
            <span className="field__counter" aria-hidden="true">
              {form.body.length}/{CANNED_BODY_MAX}
            </span>
          </label>
          <textarea
            ref={bodyRef}
            id={`${id}-body`}
            className="textarea"
            rows={7}
            value={form.body}
            maxLength={CANNED_BODY_MAX}
            onChange={set('body')}
            aria-invalid={errors.body ? true : undefined}
            aria-describedby={describedBy('body', `${id}-body-hint`)}
          />
          {errors.body && (
            <span id={`${id}-body-error`} className="field__hint field__hint--error">
              {errors.body}
            </span>
          )}
          <span id={`${id}-body-hint`} className="field__hint">
            {t('canned.dialog.bodyHint')}
          </span>
          <div className="canned-placeholders" role="group" aria-label={t('canned.dialog.placeholders')}>
            <span className="canned-placeholders__label" aria-hidden="true">
              {t('canned.dialog.placeholders')}
            </span>
            {PLACEHOLDERS.map((placeholder) => (
              <button
                key={placeholder.key}
                type="button"
                className="canned-chip"
                title={t(placeholder.label)}
                onClick={() => insertText(bodyRef.current, `{{${placeholder.key}}}`)}
              >
                {`{{${placeholder.key}}}`}
                <span className="sr-only"> – {t(placeholder.label)}</span>
              </button>
            ))}
          </div>
        </div>

        {response ? (
          <p className="field__hint">
            {response.shared ? t('canned.dialog.sharedFixed') : t('canned.dialog.personalFixed')}
          </p>
        ) : (
          canShare && (
            <div className="field">
              <label className="switch">
                <input
                  type="checkbox"
                  checked={form.shared}
                  onChange={(event) => setForm((current) => ({ ...current, shared: event.target.checked }))}
                  aria-describedby={`${id}-shared-hint`}
                />
                <span className="switch__track" aria-hidden="true" />
                {t('canned.dialog.shared')}
              </label>
              <span id={`${id}-shared-hint`} className="field__hint">
                {t('canned.dialog.sharedHint')}
              </span>
            </div>
          )
        )}
      </form>
    </Modal>
  )
}
