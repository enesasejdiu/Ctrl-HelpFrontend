// KbCategoriesPanel.jsx – the knowledge-base categories on /kb/manage: name, position and how many published articles
// each has. Staff add and edit them; admins delete one that has no articles (the API answers 409 CATEGORY_IN_USE
// otherwise, shown in the dialog). Every change is confirmed with a short status message.
import { FolderOpen, LoaderCircle, Pencil, Plus, Trash2 } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { createCategory, deleteCategory, fieldErrors, getCategories, updateCategory } from '../../api/kb'
import { errorMessage } from '../../api/client'
import Modal from '../../components/Modal'
import { Alert, EmptyState, Spinner } from '../../components/Ui'
import { useAuth } from '../../context/auth'
import { t } from '../../i18n'
import { CATEGORY_NAME_MAX } from '../../utils/kb'

export default function KbCategoriesPanel() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const [categories, setCategories] = useState(null)
  const [loadError, setLoadError] = useState(false)
  // The open dialog: { mode: 'add' | 'edit' | 'delete', category? }
  const [dialog, setDialog] = useState(null)
  const [notice, setNotice] = useState('')
  const opener = useRef(null)

  // Loads again whenever attempt changes: after an add, edit or delete, and on Try again
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let current = true
    getCategories()
      .then((list) => current && setCategories(list))
      .catch(() => current && setLoadError(true))
    return () => {
      current = false
    }
  }, [attempt])
  const reload = () => setAttempt((n) => n + 1)

  function retry() {
    setLoadError(false)
    setCategories(null)
    reload()
  }

  function open(mode, category, event) {
    opener.current = event.currentTarget
    setNotice('')
    setDialog({ mode, category })
  }

  function done(message) {
    setDialog(null)
    setNotice(message)
    reload()
  }

  return (
    <section className="card card--padded kb-section" aria-labelledby="kb-categories-title">
      <div className="kb-panel-header">
        <h2 id="kb-categories-title" className="panel-title">
          {t('kb.categories.title')}
        </h2>
        <button type="button" className="btn btn--secondary btn--sm" onClick={(e) => open('add', null, e)}>
          <Plus size={14} aria-hidden="true" />
          {t('kb.categories.add')}
        </button>
      </div>

      <p role="status" className="kb-notice">
        {notice}
      </p>

      {loadError && (
        <Alert>
          <p>{t('kb.loadError')}</p>
          <button type="button" className="btn btn--sm btn--secondary" onClick={retry}>
            {t('kb.retry')}
          </button>
        </Alert>
      )}
      {!loadError && categories === null && <Spinner label={t('kb.loading')} />}
      {categories?.length === 0 && <EmptyState icon={FolderOpen} title={t('kb.categories.empty')} />}

      {categories?.length > 0 && (
        <ul className="kb-category-list">
          {categories.map((category) => (
            <li key={category.id} className="kb-category-list__item">
              <span className="kb-category-list__name">{category.name}</span>
              <span className="kb-category-list__meta">
                {t('kb.home.articleCount', { count: category.published_count })}
              </span>
              <span className="kb-category-list__actions">
                <button
                  type="button"
                  className="btn btn--sm btn--secondary"
                  onClick={(e) => open('edit', category, e)}
                  aria-label={t('kb.categories.renameLabel', { name: category.name })}
                >
                  <Pencil size={14} aria-hidden="true" />
                  {t('kb.categories.rename')}
                </button>
                {isAdmin && (
                  <button
                    type="button"
                    className="btn btn--sm btn--secondary"
                    onClick={(e) => open('delete', category, e)}
                    aria-label={t('kb.categories.deleteLabel', { name: category.name })}
                  >
                    <Trash2 size={14} aria-hidden="true" />
                    {t('kb.categories.delete')}
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      {(dialog?.mode === 'add' || dialog?.mode === 'edit') && (
        <CategoryForm
          category={dialog.category}
          onClose={() => setDialog(null)}
          onSaved={() => done(t('kb.categories.saved'))}
          returnFocusRef={opener}
        />
      )}
      {dialog?.mode === 'delete' && (
        <DeleteCategory
          category={dialog.category}
          onClose={() => setDialog(null)}
          onDeleted={() => done(t('kb.categories.deleted'))}
          returnFocusRef={opener}
        />
      )}
    </section>
  )
}

function CategoryForm({ category, onClose, onSaved, returnFocusRef }) {
  const nameId = useId()
  const orderId = useId()
  const [name, setName] = useState(category?.name ?? '')
  const [order, setOrder] = useState(String(category?.sort_order ?? 0))
  const [errors, setErrors] = useState({})
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    const clean = name.trim()
    const problems = {}
    if (!clean) problems.name = t('kb.categories.nameRequired')
    else if (clean.length > CATEGORY_NAME_MAX) problems.name = t('kb.categories.nameLong', { max: CATEGORY_NAME_MAX })
    setErrors(problems)
    if (Object.keys(problems).length > 0) return
    setSaving(true)
    setError('')
    const fields = { name: clean, sort_order: Number.parseInt(order, 10) || 0 }
    try {
      if (category) await updateCategory(category.id, fields)
      else await createCategory(fields)
      await onSaved()
    } catch (err) {
      const byField = fieldErrors(err)
      if (err.response?.data?.code === 'CATEGORY_EXISTS') byField.name = errorMessage(err)
      if (Object.keys(byField).length > 0) setErrors(byField)
      else setError(errorMessage(err))
      setSaving(false)
    }
  }

  return (
    <Modal
      title={category ? t('kb.categories.editTitle') : t('kb.categories.addTitle')}
      onClose={saving ? undefined : onClose}
      returnFocusRef={returnFocusRef}
      footer={
        <>
          <button type="button" className="btn btn--secondary" onClick={onClose} disabled={saving}>
            {t('kb.categories.cancel')}
          </button>
          <button type="submit" form="kb-category-form" className="btn btn--primary" disabled={saving}>
            {saving && <LoaderCircle size={16} className="spin" aria-hidden="true" />}
            {t('kb.categories.save')}
          </button>
        </>
      }
    >
      <form id="kb-category-form" className="form" onSubmit={handleSubmit} noValidate>
        {error && <Alert>{error}</Alert>}
        <div className="field">
          <label htmlFor={nameId}>{t('kb.categories.name')}</label>
          <input
            id={nameId}
            className="input"
            value={name}
            maxLength={CATEGORY_NAME_MAX}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={errors.name ? `${nameId}-error` : undefined}
            data-autofocus
          />
          {errors.name && (
            <span id={`${nameId}-error`} className="field__hint field__hint--error">
              {errors.name}
            </span>
          )}
        </div>
        <div className="field">
          <label htmlFor={orderId}>{t('kb.categories.order')}</label>
          <input
            id={orderId}
            className="input"
            type="number"
            step="1"
            value={order}
            onChange={(e) => setOrder(e.target.value)}
            aria-describedby={`${orderId}-help`}
          />
          <span id={`${orderId}-help`} className="field__hint">
            {errors.sort_order ?? t('kb.categories.orderHelp')}
          </span>
        </div>
      </form>
    </Modal>
  )
}

function DeleteCategory({ category, onClose, onDeleted, returnFocusRef }) {
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  async function confirm() {
    setDeleting(true)
    setError('')
    try {
      await deleteCategory(category.id)
      await onDeleted()
    } catch (err) {
      setError(err.response?.data?.code === 'CATEGORY_IN_USE' ? t('kb.categories.inUse') : errorMessage(err))
      setDeleting(false)
    }
  }

  return (
    <Modal
      title={t('kb.categories.deleteTitle')}
      role="alertdialog"
      onClose={deleting ? undefined : onClose}
      returnFocusRef={returnFocusRef}
      footer={
        <>
          <button type="button" className="btn btn--secondary" onClick={onClose} disabled={deleting} data-autofocus>
            {t('kb.categories.cancel')}
          </button>
          <button type="button" className="btn btn--danger" onClick={confirm} disabled={deleting}>
            {deleting ? (
              <LoaderCircle size={16} className="spin" aria-hidden="true" />
            ) : (
              <Trash2 size={16} aria-hidden="true" />
            )}
            {t('kb.categories.delete')}
          </button>
        </>
      }
    >
      <div className="form">
        {error && <Alert>{error}</Alert>}
        <p>{t('kb.categories.deleteConfirm', { name: category.name })}</p>
      </div>
    </Modal>
  )
}
