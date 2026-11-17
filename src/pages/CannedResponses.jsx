// CannedResponses.jsx – /settings/canned-responses (staff): the prepared replies used in the comment box's picker.
// Tabs "Mine" (personal, only the user sees them) and "Shared" (all staff use them; admins change them), a search, and
// a table with title, preview, how often each was used and when it was last changed. Create and edit in a dialog,
// delete after a confirmation; Edit and Delete only appear where the server allows them (can_edit).
// The tab and the search are in the URL (?tab=shared&q=…), so Back and a reload keep them.
import { LoaderCircle, MessageSquareText, Pencil, Plus, Search, Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { deleteCannedResponse, listCannedResponses } from '../api/cannedResponses'
import { errorMessage } from '../api/client'
import CannedResponseDialog from '../components/canned/CannedResponseDialog'
import Modal from '../components/Modal'
import { Alert, EmptyState, PageHeader, Spinner } from '../components/Ui'
import { useAuth } from '../context/auth'
import { t } from '../i18n'
import { formatDate, timeAgo } from '../utils/format'

const TABS = [
  { value: 'mine', label: 'canned.page.mine' },
  { value: 'shared', label: 'canned.page.shared' },
]
const SEARCH_DELAY_MS = 300

export default function CannedResponses() {
  const { isAdmin } = useAuth()
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'shared' ? 'shared' : 'mine'
  const q = params.get('q') ?? ''
  const [search, setSearch] = useState(q)
  const timer = useRef(null)
  const opener = useRef(null)
  const tabRefs = useRef({})
  // The open dialog: { mode: 'edit' | 'delete', response } or { mode: 'new' }
  const [dialog, setDialog] = useState(null)
  const [notice, setNotice] = useState('')
  const [attempt, setAttempt] = useState(0)
  // The list for one tab + search: { key, items } or { key, error }
  const [list, setList] = useState(null)
  const key = `${tab}|${q}|${attempt}`

  useEffect(() => {
    const controller = new AbortController()
    listCannedResponses({ scope: tab, q }, { signal: controller.signal })
      .then((items) => setList({ key, items }))
      .catch(() => {
        if (!controller.signal.aborted) setList({ key, error: true })
      })
    return () => controller.abort()
  }, [tab, q, key])

  useEffect(() => () => clearTimeout(timer.current), [])

  const current = list?.key === key ? list : null
  const reload = () => setAttempt((n) => n + 1)

  function update(next) {
    setParams(
      (existing) => {
        const merged = new URLSearchParams(existing)
        for (const [name, value] of Object.entries(next)) {
          if (value && !(name === 'tab' && value === 'mine')) merged.set(name, value)
          else merged.delete(name)
        }
        return merged
      },
      { replace: true },
    )
  }

  function changeSearch(value) {
    setSearch(value)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => update({ q: value.trim() }), SEARCH_DELAY_MS)
  }

  function chooseTab(value) {
    setNotice('')
    update({ tab: value })
    tabRefs.current[value]?.focus()
  }

  // Arrow keys move between the tabs (and choose them), like other tab lists
  function handleTabKey(event) {
    const index = TABS.findIndex((item) => item.value === tab)
    const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key]
    if (step) {
      event.preventDefault()
      chooseTab(TABS[(index + step + TABS.length) % TABS.length].value)
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      chooseTab(TABS[event.key === 'Home' ? 0 : TABS.length - 1].value)
    }
  }

  function open(next, event) {
    opener.current = event.currentTarget
    setNotice('')
    setDialog(next)
  }

  function done(message) {
    setDialog(null)
    setNotice(message)
    reload()
  }

  const emptyTitle = q
    ? t('canned.page.noMatch', { q })
    : tab === 'mine'
      ? t('canned.page.emptyMine')
      : t('canned.page.emptyShared')
  const emptyHelp = q
    ? t('canned.page.noMatchHelp')
    : tab === 'mine'
      ? t('canned.page.emptyMineHelp')
      : isAdmin
        ? t('canned.page.emptySharedAdmin')
        : t('canned.page.emptySharedStaff')

  return (
    <>
      <PageHeader
        title={t('canned.page.title')}
        subtitle={t('canned.page.subtitle')}
        actions={
          (tab === 'mine' || isAdmin) && (
            <button type="button" className="btn btn--primary" onClick={(e) => open({ mode: 'new' }, e)}>
              <Plus size={16} aria-hidden="true" />
              {t('canned.page.new')}
            </button>
          )
        }
      />

      <div className="tabs" role="tablist" aria-label={t('canned.page.tabs')}>
        {TABS.map((item) => (
          <button
            key={item.value}
            ref={(element) => {
              tabRefs.current[item.value] = element
            }}
            type="button"
            role="tab"
            id={`canned-tab-${item.value}`}
            aria-selected={tab === item.value}
            aria-controls="canned-panel"
            tabIndex={tab === item.value ? 0 : -1}
            className={`tabs__tab${tab === item.value ? ' is-active' : ''}`}
            onClick={() => chooseTab(item.value)}
            onKeyDown={handleTabKey}
          >
            {t(item.label)}
          </button>
        ))}
      </div>

      <section id="canned-panel" role="tabpanel" aria-labelledby={`canned-tab-${tab}`} className="card">
        <div className="toolbar" role="search">
          <div className="search-input">
            <Search size={16} aria-hidden="true" className="search-input__icon" />
            <input
              type="search"
              className="input"
              value={search}
              onChange={(e) => changeSearch(e.target.value)}
              aria-label={t('canned.page.search')}
              placeholder={t('canned.page.search')}
            />
            {search && (
              <button
                type="button"
                className="search-input__clear"
                aria-label={t('kb.manage.clearSearch')}
                onClick={() => {
                  clearTimeout(timer.current)
                  setSearch('')
                  update({ q: '' })
                }}
              >
                <X size={14} aria-hidden="true" />
              </button>
            )}
          </div>
        </div>

        <p role="status" className="kb-notice canned-notice">
          {notice}
        </p>

        {current?.error && (
          <Alert>
            <p>{t('canned.page.error')}</p>
            <button type="button" className="btn btn--sm btn--secondary" onClick={reload}>
              {t('canned.page.retry')}
            </button>
          </Alert>
        )}
        {!current && <Spinner label={t('canned.page.loading')} />}
        {current?.items?.length === 0 && (
          <EmptyState icon={MessageSquareText} title={emptyTitle}>
            {emptyHelp}
          </EmptyState>
        )}

        {current?.items?.length > 0 && (
          <div className="table-wrap">
            <table className="table canned-table">
              <caption className="sr-only">{t('canned.page.table')}</caption>
              <thead>
                <tr>
                  <th scope="col">{t('canned.page.colTitle')}</th>
                  <th scope="col">{t('canned.page.colPreview')}</th>
                  <th scope="col">{t('canned.page.colUsage')}</th>
                  <th scope="col">{t('canned.page.colUpdated')}</th>
                  <th scope="col">
                    <span className="sr-only">{t('canned.page.colActions')}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {current.items.map((response) => (
                  <tr key={response.id}>
                    <td className="canned-table__title">{response.title}</td>
                    <td className="canned-table__preview">{response.body}</td>
                    <td>{t('canned.page.timesUsed', { count: response.usage_count })}</td>
                    <td>
                      <time dateTime={response.updated_at} title={formatDate(response.updated_at)}>
                        {timeAgo(response.updated_at)}
                      </time>
                    </td>
                    <td className="canned-table__actions">
                      {response.can_edit && (
                        <>
                          <button
                            type="button"
                            className="btn btn--sm btn--secondary"
                            onClick={(e) => open({ mode: 'edit', response }, e)}
                            aria-label={t('canned.page.edit', { title: response.title })}
                          >
                            <Pencil size={14} aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            className="btn btn--sm btn--secondary"
                            onClick={(e) => open({ mode: 'delete', response }, e)}
                            aria-label={t('canned.page.delete', { title: response.title })}
                          >
                            <Trash2 size={14} aria-hidden="true" />
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {(dialog?.mode === 'new' || dialog?.mode === 'edit') && (
        <CannedResponseDialog
          response={dialog.response ?? null}
          canShare={isAdmin}
          sharedDefault={tab === 'shared'}
          onClose={() => setDialog(null)}
          onSaved={() => done(t('canned.page.saved'))}
          returnFocusRef={opener}
        />
      )}
      {dialog?.mode === 'delete' && (
        <DeleteCannedResponse
          response={dialog.response}
          onClose={() => setDialog(null)}
          onDeleted={() => done(t('canned.page.deleted'))}
          returnFocusRef={opener}
        />
      )}
    </>
  )
}

function DeleteCannedResponse({ response, onClose, onDeleted, returnFocusRef }) {
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  async function confirm() {
    setDeleting(true)
    setError('')
    try {
      await deleteCannedResponse(response.id)
      onDeleted()
    } catch (err) {
      setError(errorMessage(err))
      setDeleting(false)
    }
  }

  return (
    <Modal
      title={t('canned.delete.title')}
      role="alertdialog"
      onClose={deleting ? undefined : onClose}
      returnFocusRef={returnFocusRef}
      footer={
        <>
          <button type="button" className="btn btn--secondary" onClick={onClose} disabled={deleting} data-autofocus>
            {t('canned.delete.cancel')}
          </button>
          <button type="button" className="btn btn--danger" onClick={confirm} disabled={deleting}>
            {deleting ? (
              <LoaderCircle size={16} className="spin" aria-hidden="true" />
            ) : (
              <Trash2 size={16} aria-hidden="true" />
            )}
            {deleting ? t('canned.delete.deleting') : t('canned.delete.button')}
          </button>
        </>
      }
    >
      {error && <Alert>{error}</Alert>}
      <p>{t('canned.delete.confirm', { title: response.title })}</p>
      {response.shared && <p className="field__hint">{t('canned.delete.sharedNote')}</p>}
    </Modal>
  )
}
