// Settings.jsx – app settings for admins at /admin/settings. Three cards:
//   Company     – the company name (GET/PATCH /settings), shown next to the logo in the top bar and on the login page.
//   Categories  – add, edit, archive / restore and delete ticket categories (POST/PATCH/DELETE /categories). Archived
//                 ones aren't offered for new tickets but still show on old ones. Only an unused category can be
//                 deleted: the backend refuses otherwise (409 CATEGORY_IN_USE), and the button is disabled when the
//                 list says it's in use (ticket_count) or after such a refusal.
//   Priorities  – the target time of each of the 4 fixed levels (PATCH /priorities/:id { target_hours }, 1–2160).
// Categories and priorities come from GET /meta.
import { Archive, ArchiveRestore, Check, LoaderCircle, Pencil, Plus, Save, Trash2 } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import client, { errorMessage } from '../api/client'
import { PriorityBadge } from '../components/Badges'
import CategoryDialog from '../components/CategoryDialog'
import Modal from '../components/Modal'
import { Alert, EmptyState, PageHeader, Spinner } from '../components/Ui'
import { setCompanyName } from '../settings/companyName'
import { hoursLabel } from '../utils/format'

const COMPANY_NAME_MAX = 100
const MIN_HOURS = 1
const MAX_HOURS = 2160 // 90 days
const IN_USE_HINT = 'Tickets use this category, archive it instead'

// The backend's message for `field` from a 400 { errors: [{ field, message }] }, if there is one
const fieldMessage = (err, field) => err?.response?.data?.errors?.find((e) => e.field === field)?.message
const byName = (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })

export default function Settings() {
  const [meta, setMeta] = useState(null)
  const [metaError, setMetaError] = useState('')

  useEffect(() => {
    client
      .get('/meta')
      .then(({ data }) => setMeta({ categories: [...data.categories].sort(byName), priorities: data.priorities }))
      .catch((err) => setMetaError(errorMessage(err)))
  }, [])

  const setCategories = (update) => setMeta((current) => ({ ...current, categories: update(current.categories) }))
  const setPriorities = (update) => setMeta((current) => ({ ...current, priorities: update(current.priorities) }))

  return (
    <>
      <PageHeader
        title="Settings"
        subtitle="The company name, ticket categories and how fast each priority should be handled."
      />
      <div className="settings">
        <CompanyCard />
        {metaError && <Alert>{metaError}</Alert>}
        {!meta && !metaError && (
          <div className="card">
            <Spinner label="Loading categories and priorities…" />
          </div>
        )}
        {meta && <CategoriesCard categories={meta.categories} setCategories={setCategories} />}
        {meta && <PrioritiesCard priorities={meta.priorities} setPriorities={setPriorities} />}
      </div>
    </>
  )
}

// "Saved" next to a button, announced to screen readers
function SavedNote() {
  return (
    <span className="saved-note" role="status">
      <Check size={14} aria-hidden="true" />
      Saved
    </span>
  )
}

function CompanyCard() {
  const [saved, setSaved] = useState(null) // the stored name; null while loading
  const [value, setValue] = useState('')
  const [loadError, setLoadError] = useState('')
  const [fieldError, setFieldError] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [justSaved, setJustSaved] = useState(false)

  useEffect(() => {
    client
      .get('/settings')
      .then(({ data }) => {
        setSaved(data.company_name ?? '')
        setValue(data.company_name ?? '')
      })
      .catch((err) => setLoadError(errorMessage(err)))
  }, [])

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setJustSaved(false)
    const name = value.trim()
    if (!name) return setFieldError('Company name is required')
    if (name.length > COMPANY_NAME_MAX)
      return setFieldError(`Company name must be ${COMPANY_NAME_MAX} characters or less`)
    setSaving(true)
    try {
      const { data } = await client.patch('/settings', { company_name: name })
      setSaved(data.company_name)
      setValue(data.company_name)
      setCompanyName(data.company_name) // the top bar changes at once
      setJustSaved(true)
    } catch (err) {
      const message = fieldMessage(err, 'company_name')
      if (message) setFieldError(message)
      else setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const unchanged = saved !== null && value.trim() === saved

  return (
    <section className="card card--padded" aria-labelledby="settings-company">
      <h2 id="settings-company" className="panel-title">
        Company
      </h2>
      {loadError && <Alert>{loadError}</Alert>}
      {saved === null && !loadError && <Spinner label="Loading…" />}
      {saved !== null && (
        <form className="form settings__company" onSubmit={handleSubmit} noValidate>
          {error && <Alert>{error}</Alert>}
          <div className="field">
            <label htmlFor="company-name">Company name</label>
            <input
              id="company-name"
              className="input"
              value={value}
              maxLength={COMPANY_NAME_MAX}
              onChange={(e) => {
                setValue(e.target.value)
                setFieldError('')
                setJustSaved(false)
              }}
              aria-invalid={fieldError ? true : undefined}
              aria-describedby={fieldError ? 'company-name-error' : 'company-name-hint'}
            />
            {fieldError ? (
              <span id="company-name-error" className="field__hint field__hint--error">
                {fieldError}
              </span>
            ) : (
              <span id="company-name-hint" className="field__hint">
                Shown next to the logo for everyone, and on the sign-in page.
              </span>
            )}
          </div>
          <div className="settings__actions">
            {justSaved && <SavedNote />}
            <button type="submit" className="btn btn--primary" disabled={saving || unchanged}>
              {saving ? (
                <LoaderCircle size={16} className="spin" aria-hidden="true" />
              ) : (
                <Save size={16} aria-hidden="true" />
              )}
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      )}
    </section>
  )
}

function CategoriesCard({ categories, setCategories }) {
  const [dialog, setDialog] = useState(null) // { type: 'add' } | { type: 'edit', category } | { type: 'delete', category }
  const [busyId, setBusyId] = useState(null)
  const [error, setError] = useState('')
  // Categories the backend refused to delete because tickets use them (when the list didn't say so)
  const [inUseIds, setInUseIds] = useState(() => new Set())
  const trigger = useRef(null)

  const inUse = (category) => Number(category.ticket_count) > 0 || inUseIds.has(category.id)

  function open(event, next) {
    trigger.current = event.currentTarget
    setError('')
    setDialog(next)
  }

  function handleSaved(saved) {
    setCategories((current) => [...current.filter((c) => c.id !== saved.id), saved].sort(byName))
    setDialog(null)
  }

  async function setActive(category, isActive) {
    setBusyId(category.id)
    setError('')
    try {
      const { data } = await client.patch(`/categories/${category.id}`, { is_active: isActive })
      setCategories((current) => current.map((c) => (c.id === category.id ? { ...c, ...data } : c)))
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section className="card" aria-labelledby="settings-categories">
      <div className="settings__card-header">
        <h2 id="settings-categories" className="panel-title">
          Categories
        </h2>
        <button type="button" className="btn btn--secondary btn--sm" onClick={(e) => open(e, { type: 'add' })}>
          <Plus size={14} aria-hidden="true" />
          Add category
        </button>
      </div>
      <p className="settings__hint text-muted">
        Archived categories aren&apos;t offered for new tickets, but stay on the tickets that already use them.
      </p>

      {error && (
        <div className="card__section">
          <Alert>{error}</Alert>
        </div>
      )}

      {categories.length === 0 ? (
        <EmptyState title="No categories yet">Add one so people can file tickets.</EmptyState>
      ) : (
        <div className="table-wrap">
          <table className="table table--stack">
            <thead>
              <tr>
                <th>Name</th>
                <th>Description</th>
                <th>Status</th>
                <th className="table__actions">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {categories.map((category) => {
                const active = category.is_active !== false
                const busy = busyId === category.id
                return (
                  <tr key={category.id} className={active ? undefined : 'is-inactive'}>
                    <td>
                      <span className="table__title">{category.name}</span>
                    </td>
                    <td className="text-muted settings__description" data-label="Description">
                      {category.description || '—'}
                    </td>
                    <td data-label="Status">
                      <span className={`badge badge--${active ? 'active' : 'inactive'}`}>
                        <span className="badge__dot" aria-hidden="true" />
                        {active ? 'Active' : 'Archived'}
                      </span>
                    </td>
                    <td className="table__actions">
                      <div className="row-actions">
                        <button
                          type="button"
                          className="btn btn--sm btn--secondary btn--icon"
                          onClick={(e) => open(e, { type: 'edit', category })}
                          disabled={busy}
                          aria-label={`Edit ${category.name}`}
                          title="Edit"
                        >
                          <Pencil size={14} aria-hidden="true" />
                          <span className="row-actions__text">Edit</span>
                        </button>
                        <button
                          type="button"
                          className="btn btn--sm btn--secondary"
                          onClick={() => setActive(category, !active)}
                          disabled={busy}
                          aria-label={`${active ? 'Archive' : 'Restore'} ${category.name}`}
                        >
                          {active ? (
                            <Archive size={14} aria-hidden="true" />
                          ) : (
                            <ArchiveRestore size={14} aria-hidden="true" />
                          )}
                          {active ? 'Archive' : 'Restore'}
                        </button>
                        {/* A disabled button gets no hover in some browsers, so the wrapper carries the tooltip */}
                        <span className="row-actions__wrap" title={inUse(category) ? IN_USE_HINT : 'Delete'}>
                          <button
                            type="button"
                            className="btn btn--sm btn--secondary btn--icon"
                            onClick={(e) => open(e, { type: 'delete', category })}
                            disabled={busy || inUse(category)}
                            aria-label={`Delete ${category.name}`}
                            aria-describedby={inUse(category) ? `category-${category.id}-in-use` : undefined}
                          >
                            <Trash2 size={14} aria-hidden="true" />
                            <span className="row-actions__text">Delete</span>
                          </button>
                          {inUse(category) && (
                            <span id={`category-${category.id}-in-use`} className="sr-only">
                              {IN_USE_HINT}
                            </span>
                          )}
                        </span>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {(dialog?.type === 'add' || dialog?.type === 'edit') && (
        <CategoryDialog
          category={dialog.category ?? null}
          onSaved={handleSaved}
          onCancel={() => setDialog(null)}
          returnFocusRef={trigger}
        />
      )}
      {dialog?.type === 'delete' && (
        <DeleteCategoryDialog
          category={dialog.category}
          returnFocusRef={trigger}
          onCancel={() => setDialog(null)}
          onDeleted={(deleted) => {
            setCategories((current) => current.filter((c) => c.id !== deleted.id))
            setDialog(null)
          }}
          onInUse={(category) => setInUseIds((current) => new Set(current).add(category.id))}
        />
      )}
    </section>
  )
}

function DeleteCategoryDialog({ category, onDeleted, onInUse, onCancel, returnFocusRef }) {
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')
  const [refused, setRefused] = useState(false)

  async function remove() {
    setDeleting(true)
    setError('')
    try {
      await client.delete(`/categories/${category.id}`)
      onDeleted(category)
    } catch (err) {
      setError(errorMessage(err))
      if (err.response?.data?.code === 'CATEGORY_IN_USE') {
        setRefused(true)
        onInUse(category)
      }
      setDeleting(false)
    }
  }

  return (
    <Modal
      title="Delete category"
      role="alertdialog"
      onClose={deleting ? undefined : onCancel}
      returnFocusRef={returnFocusRef}
      footer={
        <>
          <button type="button" className="btn btn--secondary" onClick={onCancel} disabled={deleting} data-autofocus>
            Cancel
          </button>
          <button type="button" className="btn btn--danger" onClick={remove} disabled={deleting || refused}>
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
        {error && <Alert>{error}</Alert>}
        <p>Delete {category.name}? This can&apos;t be undone.</p>
      </div>
    </Modal>
  )
}

function PrioritiesCard({ priorities, setPriorities }) {
  const sorted = [...priorities].sort((a, b) => a.level - b.level)
  return (
    <section className="card card--padded" aria-labelledby="settings-priorities">
      <h2 id="settings-priorities" className="panel-title">
        Priorities
      </h2>
      <p className="settings__hint text-muted">
        How long IT has for a ticket of each priority before it counts as overdue. The four levels themselves are fixed.
      </p>
      <ul className="priority-settings">
        {sorted.map((priority) => (
          <PriorityRow
            key={priority.id}
            priority={priority}
            onSaved={(saved) =>
              setPriorities((current) => current.map((p) => (p.id === saved.id ? { ...p, ...saved } : p)))
            }
          />
        ))}
      </ul>
    </section>
  )
}

function PriorityRow({ priority, onSaved }) {
  const id = useId()
  const [value, setValue] = useState(String(priority.target_hours))
  const [fieldError, setFieldError] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [justSaved, setJustSaved] = useState(false)

  const hours = Number(value)
  const valid = /^\d+$/.test(value.trim()) && hours >= MIN_HOURS && hours <= MAX_HOURS
  const unchanged = valid && hours === priority.target_hours

  async function save(event) {
    event.preventDefault()
    setError('')
    setJustSaved(false)
    if (!valid) {
      setFieldError(`Enter a whole number of hours from ${MIN_HOURS} to ${MAX_HOURS}`)
      return
    }
    setSaving(true)
    try {
      const { data } = await client.patch(`/priorities/${priority.id}`, { target_hours: hours })
      onSaved(data)
      setValue(String(data.target_hours))
      setJustSaved(true)
    } catch (err) {
      const message = fieldMessage(err, 'target_hours')
      if (message) setFieldError(message)
      else setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const describedBy = fieldError ? `${id}-error` : `${id}-preview`
  return (
    <li className="priority-settings__row">
      <form className="priority-settings__form" onSubmit={save} noValidate>
        <span className="priority-settings__level">
          <PriorityBadge priority={priority.name} />
        </span>
        <div className="field priority-settings__field">
          <label htmlFor={id}>
            Target time (hours)<span className="sr-only"> for {priority.name}</span>
          </label>
          <input
            id={id}
            className="input"
            type="number"
            inputMode="numeric"
            min={MIN_HOURS}
            max={MAX_HOURS}
            step={1}
            value={value}
            onChange={(e) => {
              setValue(e.target.value)
              setFieldError('')
              setJustSaved(false)
            }}
            aria-invalid={fieldError ? true : undefined}
            aria-describedby={describedBy}
          />
          {fieldError ? (
            <span id={`${id}-error`} className="field__hint field__hint--error">
              {fieldError}
            </span>
          ) : (
            <span id={`${id}-preview`} className="field__hint">
              {valid ? hoursLabel(hours) : '—'}
            </span>
          )}
        </div>
        <div className="priority-settings__actions">
          {justSaved && <SavedNote />}
          <button
            type="submit"
            className="btn btn--secondary btn--sm"
            disabled={saving || unchanged}
            aria-label={`Save ${priority.name}`}
          >
            {saving ? (
              <LoaderCircle size={14} className="spin" aria-hidden="true" />
            ) : (
              <Save size={14} aria-hidden="true" />
            )}
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
      {error && <Alert>{error}</Alert>}
    </li>
  )
}
