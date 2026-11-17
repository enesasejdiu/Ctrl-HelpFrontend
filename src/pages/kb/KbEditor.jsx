// KbEditor.jsx – writing a knowledge-base article, staff only: /kb/new and /kb/:slug/edit.
//   Fields: title, address (the slug: shown; editable only for a draft that was never published), category, summary
//   (with a counter) and the article (Markdown, with a formatting toolbar and a live preview that uses the same
//   sanitized renderer as the article page; side by side on wide screens, Write / Preview on narrow ones).
//   Buttons: Save draft / Save changes, Publish / Unpublish, Cancel, and Delete (admins) with a confirmation.
//   Checks: the same rules as the server, shown under each field; the server's own messages land there too.
//   Unsaved changes: leaving asks first (router blocker and beforeunload), and a copy of the draft is kept in
//   localStorage (per article) while it differs from what's saved, offered back after a crash or a closed tab.
//   Two editors: a save sends the updated_at it started from; 409 ARTICLE_CHANGED opens a dialog to reload their version
//   (your text is copied to the clipboard first) or cancel.
import { Bold, Code, Heading2, Italic, Link2, List, ListOrdered, LoaderCircle, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { Link, useBlocker, useNavigate, useParams } from 'react-router'
import { errorMessage, isNotFound } from '../../api/client'
import { createArticle, deleteArticle, fieldErrors, getArticle, getCategories, updateArticle } from '../../api/kb'
import MarkdownView from '../../components/kb/MarkdownView'
import Modal from '../../components/Modal'
import NotFound from '../../components/NotFound'
import { Alert, PageHeader, Spinner } from '../../components/Ui'
import { useAuth } from '../../context/auth'
import { t } from '../../i18n'
import { SUMMARY_MAX, TITLE_MAX, validateArticle } from '../../utils/kb'
import { applyFormat } from '../../utils/markdownEdit'
import { readDraftBackup, removeDraftBackup, writeDraftBackup } from './draftBackup'

const BACKUP_DELAY_MS = 500
const EMPTY = { title: '', slug: '', summary: '', body: '', category_id: '' }
const FIELDS = ['title', 'slug', 'summary', 'body', 'category_id']

const TOOLS = [
  { kind: 'bold', icon: Bold, label: 'kb.editor.bold' },
  { kind: 'italic', icon: Italic, label: 'kb.editor.italic' },
  { kind: 'heading', icon: Heading2, label: 'kb.editor.heading' },
  { kind: 'bulleted', icon: List, label: 'kb.editor.bulletList' },
  { kind: 'numbered', icon: ListOrdered, label: 'kb.editor.numberedList' },
  { kind: 'link', icon: Link2, label: 'kb.editor.link' },
  { kind: 'code', icon: Code, label: 'kb.editor.code' },
]

// The editor's fields for an article from the API
const formFrom = (article) => ({
  title: article.title,
  slug: article.slug,
  summary: article.summary ?? '',
  body: article.body,
  category_id: String(article.category.id),
})
const sameForm = (a, b) => FIELDS.every((field) => a[field] === b[field])

export default function KbEditor() {
  const { slug } = useParams()
  // A different article (or a new one) gets a fresh editor
  return <Editor key={slug ?? 'new'} slug={slug} />
}

function Editor({ slug }) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const ids = { title: useId(), slug: useId(), category: useId(), summary: useId(), body: useId() }
  const bodyRef = useRef(null)

  // The article as the server has it (null for a new one), and the updated_at the next save starts from
  const [article, setArticle] = useState(null)
  const [baseUpdatedAt, setBaseUpdatedAt] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [categories, setCategories] = useState(null)
  const [form, setForm] = useState(EMPTY)
  // What's saved: the form matches it when there's nothing new
  const [saved, setSaved] = useState(EMPTY)
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(null) // null, or which button is working: 'save' | 'publish' | 'unpublish'
  const [pane, setPane] = useState('write') // narrow screens: which of Write / Preview is shown
  const [backup, setBackup] = useState(null) // a copy from an earlier visit, offered back
  const [conflict, setConflict] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const deleteTrigger = useRef(null)

  const loading = (slug && !article && !loadError) || categories === null
  const backupId = article?.id ?? 'new'
  const dirty = !loading && !sameForm(form, saved)
  // The slug can change only before the first publish (the server says SLUG_FIXED after that)
  const slugEditable = Boolean(article && !article.published_at)

  // ---- Loading ----
  // An unsaved copy from before (a crash, a closed tab) that differs from what's saved is offered back, once, when the
  // article (or, for a new one, the editor) has loaded
  useEffect(() => {
    let current = true
    const offerBackup = (key, savedForm) => {
      const found = readDraftBackup(key)
      if (found?.form && !sameForm({ ...EMPTY, ...found.form }, savedForm)) setBackup(found)
    }
    getCategories()
      .then((list) => {
        if (!current) return
        setCategories(list)
        if (!slug) offerBackup('new', EMPTY)
      })
      .catch((error) => current && setLoadError(error))
    if (slug) {
      getArticle(slug)
        .then((loaded) => {
          if (!current) return
          setArticle(loaded)
          setBaseUpdatedAt(loaded.updated_at)
          setForm(formFrom(loaded))
          setSaved(formFrom(loaded))
          offerBackup(loaded.id, formFrom(loaded))
        })
        .catch((error) => current && setLoadError(error))
    }
    return () => {
      current = false
    }
  }, [slug])

  // ---- The local copy while there are unsaved changes ----
  useEffect(() => {
    if (loading || backup) return undefined
    if (!dirty) {
      removeDraftBackup(backupId)
      return undefined
    }
    const timer = setTimeout(
      () => writeDraftBackup(backupId, { form, at: Date.now(), updated_at: baseUpdatedAt }),
      BACKUP_DELAY_MS,
    )
    return () => clearTimeout(timer)
  }, [form, dirty, loading, backup, backupId, baseUpdatedAt])

  // ---- Leaving with unsaved changes ----
  // Read at navigation time, so a navigation right after a save (before the next render) isn't blocked
  const leaveAllowed = useRef(false)
  const dirtyRef = useRef(dirty)
  useEffect(() => {
    dirtyRef.current = dirty
  }, [dirty])
  const blocker = useBlocker(
    useCallback(
      ({ currentLocation, nextLocation }) =>
        dirtyRef.current && !leaveAllowed.current && currentLocation.pathname !== nextLocation.pathname,
      [],
    ),
  )
  useEffect(() => {
    if (!dirty) return undefined
    const warn = (event) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  // Navigates without the unsaved-changes question (after a save, a delete, or "Leave")
  function leave(to, options) {
    leaveAllowed.current = true
    navigate(to, options)
  }

  // ---- Editing ----
  function change(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: undefined }))
    setNotice('')
  }

  function format(kind) {
    const textarea = bodyRef.current
    const next = applyFormat(form.body, textarea.selectionStart, textarea.selectionEnd, kind)
    change('body', next.text)
    // After React has put the new text in, select what was just formatted
    requestAnimationFrame(() => {
      textarea.focus()
      textarea.setSelectionRange(next.start, next.end)
    })
  }

  // ---- Saving ----
  async function save(status) {
    const problems = validateArticle(form, { checkSlug: slugEditable })
    setErrors(problems)
    setNotice('')
    setFormError('')
    if (Object.keys(problems).length > 0) {
      setFormError(t('kb.editor.fixErrors'))
      return
    }
    setSaving(
      status === 'published' ? 'publish' : status === 'draft' && article?.status === 'published' ? 'unpublish' : 'save',
    )
    try {
      const fields = {
        title: form.title.trim(),
        summary: form.summary.trim(),
        body: form.body,
        category_id: Number(form.category_id),
      }
      let result
      if (!article) {
        result = await createArticle({ ...fields, status: status ?? 'draft' })
        removeDraftBackup('new')
      } else {
        // Only what changed, plus the updated_at this edit started from
        const before = { ...formFrom(article), title: article.title.trim(), category_id: article.category.id }
        const changes = Object.fromEntries(
          Object.entries({ ...fields, ...(slugEditable ? { slug: form.slug } : {}) }).filter(
            ([field, value]) => String(value) !== String(before[field]),
          ),
        )
        if (status && status !== article.status) changes.status = status
        result =
          Object.keys(changes).length > 0
            ? await updateArticle(article.id, { updated_at: baseUpdatedAt, ...changes })
            : article
      }
      removeDraftBackup(result.id)
      setArticle(result)
      setBaseUpdatedAt(result.updated_at)
      setForm(formFrom(result))
      setSaved(formFrom(result))
      setSaving(null)

      if (result.status === 'published' && (status === 'published' || !article)) {
        leave(`/kb/${result.slug}`, { state: { flash: t('kb.editor.published') } })
      } else if (!article || result.slug !== slug) {
        // A new article (or a new address) moves the editor to its own address
        leave(`/kb/${result.slug}/edit`, { replace: true, state: { flash: t('kb.editor.saved') } })
      } else {
        setNotice(status === 'draft' ? t('kb.editor.unpublished') : t('kb.editor.saved'))
      }
    } catch (err) {
      setSaving(null)
      const code = err.response?.data?.code
      if (code === 'ARTICLE_CHANGED') return setConflict(true)
      const byField = fieldErrors(err)
      if (code === 'SLUG_FIXED' || code === 'SLUG_TAKEN') byField.slug = errorMessage(err)
      if (Object.keys(byField).length > 0) {
        setErrors(byField)
        setFormError(t('kb.editor.fixErrors'))
      } else {
        setFormError(errorMessage(err))
      }
    }
  }

  // ---- Someone else saved: load their version (your text goes to the clipboard first) ----
  async function reloadTheirs() {
    let copied = false
    try {
      await navigator.clipboard.writeText(form.body)
      copied = true
    } catch {
      // No clipboard (permissions, an old browser): the dialog said to copy first
    }
    try {
      const theirs = await getArticle(article.slug)
      setArticle(theirs)
      setBaseUpdatedAt(theirs.updated_at)
      setForm(formFrom(theirs))
      setSaved(formFrom(theirs))
      setErrors({})
      setFormError('')
      setConflict(false)
      setNotice(copied ? t('kb.editor.conflictCopied') : t('kb.editor.conflictLoaded'))
    } catch (err) {
      setConflict(false)
      setFormError(errorMessage(err))
    }
  }

  async function remove() {
    setDeleting(true)
    try {
      await deleteArticle(article.id)
      removeDraftBackup(backupId)
      leave('/kb/manage', { state: { flash: t('kb.editor.deleted') } })
    } catch (err) {
      setDeleting(false)
      setConfirmDelete(false)
      setFormError(errorMessage(err))
    }
  }

  const backupTime = useMemo(
    () => (backup?.at ? new Date(backup.at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : ''),
    [backup],
  )

  // ---- What's shown ----
  if (loadError && isNotFound(loadError)) return <NotFound message={t('kb.editor.notFound')} />
  if (loadError) return <Alert>{errorMessage(loadError)}</Alert>
  if (loading) return <Spinner label={t('kb.loading')} />

  const busy = saving !== null || deleting
  const published = article?.status === 'published'
  const cancelTo = article ? `/kb/${article.slug}` : '/kb/manage'
  const fieldProps = (field, id) => ({
    id,
    'aria-invalid': errors[field] ? true : undefined,
    'aria-describedby': [errors[field] && `${id}-error`, `${id}-help`].filter(Boolean).join(' ') || undefined,
  })
  const fieldError = (field, id) =>
    errors[field] && (
      <span id={`${id}-error`} className="field__hint field__hint--error">
        {errors[field]}
      </span>
    )

  return (
    <>
      <nav aria-label={t('kb.breadcrumb')} className="breadcrumb">
        <Link to="/kb">{t('kb.title')}</Link>
        <span aria-hidden="true"> / </span>
        <Link to="/kb/manage">{t('kb.manage.title')}</Link>
      </nav>
      <PageHeader title={article ? t('kb.editor.editTitle') : t('kb.editor.newTitle')} subtitle={article?.title} />

      {backup && (
        <Alert tone="warning">
          <p>{t('kb.editor.backupFound', { time: backupTime })}</p>
          <div className="button-row">
            <button
              type="button"
              className="btn btn--sm btn--secondary"
              onClick={() => {
                setForm({ ...EMPTY, ...backup.form })
                // Saved over a version that changed since? The save then says so (ARTICLE_CHANGED)
                if (backup.updated_at) setBaseUpdatedAt(backup.updated_at)
                setBackup(null)
              }}
            >
              {t('kb.editor.backupRestore')}
            </button>
            <button
              type="button"
              className="btn btn--sm btn--secondary"
              onClick={() => {
                removeDraftBackup(backupId)
                setBackup(null)
              }}
            >
              {t('kb.editor.backupDiscard')}
            </button>
          </div>
        </Alert>
      )}

      <form
        className="card card--padded form kb-editor"
        onSubmit={(event) => {
          event.preventDefault()
          save()
        }}
        noValidate
        aria-busy={busy || undefined}
      >
        {formError && <Alert>{formError}</Alert>}
        <p role="status" className="kb-notice">
          {notice}
        </p>

        <div className="field">
          <label htmlFor={ids.title}>{t('kb.editor.title')}</label>
          <input
            {...fieldProps('title', ids.title)}
            className="input"
            value={form.title}
            maxLength={TITLE_MAX}
            onChange={(e) => change('title', e.target.value)}
            autoFocus={!article}
          />
          {fieldError('title', ids.title)}
        </div>

        <div className="field">
          <label htmlFor={ids.slug}>{t('kb.editor.slug')}</label>
          {slugEditable ? (
            <input
              {...fieldProps('slug', ids.slug)}
              className="input"
              value={form.slug}
              onChange={(e) => change('slug', e.target.value.toLowerCase())}
              spellCheck={false}
            />
          ) : (
            <output id={ids.slug} className="kb-editor__slug" aria-describedby={`${ids.slug}-help`}>
              {article ? `/kb/${article.slug}` : '—'}
            </output>
          )}
          {fieldError('slug', ids.slug)}
          <span id={`${ids.slug}-help`} className="field__hint">
            {!article ? t('kb.editor.slugNew') : slugEditable ? t('kb.editor.slugDraftHelp') : t('kb.editor.slugFixed')}
          </span>
        </div>

        <div className="field">
          <label htmlFor={ids.category}>{t('kb.editor.category')}</label>
          <select
            {...fieldProps('category_id', ids.category)}
            className="select"
            value={form.category_id}
            onChange={(e) => change('category_id', e.target.value)}
          >
            <option value="">{t('kb.editor.categoryChoose')}</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
          {fieldError('category_id', ids.category)}
          {categories.length === 0 && (
            <span id={`${ids.category}-help`} className="field__hint">
              {t('kb.editor.noCategories')} <Link to="/kb/manage">{t('kb.editor.addCategoryLink')}</Link>
            </span>
          )}
        </div>

        <div className="field">
          <label htmlFor={ids.summary}>{t('kb.editor.summary')}</label>
          <textarea
            {...fieldProps('summary', ids.summary)}
            className="textarea"
            rows={2}
            value={form.summary}
            onChange={(e) => change('summary', e.target.value)}
          />
          {fieldError('summary', ids.summary)}
          <span id={`${ids.summary}-help`} className="field__hint kb-editor__counter">
            <span>{t('kb.editor.summaryHelp')}</span>
            <span className={form.summary.trim().length > SUMMARY_MAX ? 'kb-editor__over' : undefined}>
              {t('kb.editor.counter', { count: form.summary.trim().length, max: SUMMARY_MAX })}
            </span>
          </span>
        </div>

        <div className="field">
          <span className="kb-editor__body-label">
            <label htmlFor={ids.body}>{t('kb.editor.body')}</label>
            <span className="kb-editor__panes-switch">
              {['write', 'preview'].map((name) => (
                <button
                  key={name}
                  type="button"
                  className="btn btn--sm btn--secondary"
                  aria-pressed={pane === name}
                  onClick={() => setPane(name)}
                >
                  {t(name === 'write' ? 'kb.editor.write' : 'kb.editor.preview')}
                </button>
              ))}
            </span>
          </span>
          <div className="kb-editor__panes">
            <div className={`kb-editor__pane${pane === 'write' ? '' : ' is-inactive'}`}>
              <div className="kb-editor__toolbar" role="group" aria-label={t('kb.editor.toolbar')}>
                {TOOLS.map(({ kind, icon: Icon, label }) => (
                  <button
                    key={kind}
                    type="button"
                    className="icon-button"
                    onClick={() => format(kind)}
                    aria-label={t(label)}
                    title={t(label)}
                  >
                    <Icon size={16} aria-hidden="true" />
                  </button>
                ))}
              </div>
              <textarea
                {...fieldProps('body', ids.body)}
                ref={bodyRef}
                className="textarea kb-editor__body"
                rows={18}
                value={form.body}
                onChange={(e) => change('body', e.target.value)}
                spellCheck
              />
              {fieldError('body', ids.body)}
              <span id={`${ids.body}-help`} className="field__hint">
                {t('kb.editor.bodyHelp')}
              </span>
            </div>
            <section
              className={`kb-editor__pane kb-editor__preview${pane === 'preview' ? '' : ' is-inactive'}`}
              aria-label={t('kb.editor.preview')}
            >
              {form.body.trim() ? (
                <MarkdownView source={form.body} />
              ) : (
                <p className="text-muted">{t('kb.editor.previewEmpty')}</p>
              )}
            </section>
          </div>
        </div>

        <div className="form__actions kb-editor__actions">
          {isAdmin && article && (
            <button
              type="button"
              className="btn btn--danger kb-editor__delete"
              onClick={(event) => {
                deleteTrigger.current = event.currentTarget
                setConfirmDelete(true)
              }}
              disabled={busy}
            >
              <Trash2 size={16} aria-hidden="true" />
              {t('kb.editor.delete')}
            </button>
          )}
          <Link to={cancelTo} className="btn btn--secondary">
            {t('kb.editor.cancel')}
          </Link>
          <button type="submit" className="btn btn--secondary" disabled={busy}>
            {saving === 'save' && <LoaderCircle size={16} className="spin" aria-hidden="true" />}
            {published ? t('kb.editor.saveChanges') : t('kb.editor.saveDraft')}
          </button>
          {published ? (
            <button type="button" className="btn btn--secondary" onClick={() => save('draft')} disabled={busy}>
              {saving === 'unpublish' && <LoaderCircle size={16} className="spin" aria-hidden="true" />}
              {t('kb.editor.unpublish')}
            </button>
          ) : (
            <button type="button" className="btn btn--primary" onClick={() => save('published')} disabled={busy}>
              {saving === 'publish' && <LoaderCircle size={16} className="spin" aria-hidden="true" />}
              {t('kb.editor.publish')}
            </button>
          )}
        </div>
      </form>

      {blocker.state === 'blocked' && (
        <Modal
          title={t('kb.editor.leaveTitle')}
          role="alertdialog"
          onClose={() => blocker.reset()}
          footer={
            <>
              <button type="button" className="btn btn--secondary" onClick={() => blocker.reset()} data-autofocus>
                {t('kb.editor.stay')}
              </button>
              <button
                type="button"
                className="btn btn--danger"
                onClick={() => {
                  removeDraftBackup(backupId)
                  leaveAllowed.current = true
                  blocker.proceed()
                }}
              >
                {t('kb.editor.leave')}
              </button>
            </>
          }
        >
          <p>{t('kb.editor.leaveText')}</p>
        </Modal>
      )}

      {conflict && (
        <Modal
          title={t('kb.editor.conflictTitle')}
          role="alertdialog"
          onClose={() => setConflict(false)}
          footer={
            <>
              <button type="button" className="btn btn--secondary" onClick={() => setConflict(false)} data-autofocus>
                {t('kb.editor.cancel')}
              </button>
              <button type="button" className="btn btn--primary" onClick={reloadTheirs}>
                {t('kb.editor.conflictReload')}
              </button>
            </>
          }
        >
          <p>{navigator.clipboard ? t('kb.editor.conflictText') : t('kb.editor.conflictTextNoClipboard')}</p>
        </Modal>
      )}

      {confirmDelete && (
        <Modal
          title={t('kb.editor.deleteTitle')}
          role="alertdialog"
          onClose={deleting ? undefined : () => setConfirmDelete(false)}
          returnFocusRef={deleteTrigger}
          footer={
            <>
              <button
                type="button"
                className="btn btn--secondary"
                onClick={() => setConfirmDelete(false)}
                disabled={deleting}
                data-autofocus
              >
                {t('kb.editor.cancel')}
              </button>
              <button type="button" className="btn btn--danger" onClick={remove} disabled={deleting}>
                {deleting ? (
                  <LoaderCircle size={16} className="spin" aria-hidden="true" />
                ) : (
                  <Trash2 size={16} aria-hidden="true" />
                )}
                {t('kb.editor.delete')}
              </button>
            </>
          }
        >
          <p>{t('kb.editor.deleteConfirm', { title: article.title })}</p>
        </Modal>
      )}
    </>
  )
}
