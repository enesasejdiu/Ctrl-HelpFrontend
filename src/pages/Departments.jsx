// Departments.jsx – the departments users can be put in, at /admin/departments (admins and HR).
// Lists them with their number of users (GET /departments), and adds (POST), renames (PATCH /:id) and deletes
// (DELETE /:id) them. Only an empty department can be deleted: the backend refuses otherwise, so the button is
// disabled while a department has users. Every change updates the list in place.
import { Building2, Pencil, Plus, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import client, { errorMessage } from '../api/client'
import DeleteDepartmentDialog from '../components/DeleteDepartmentDialog'
import DepartmentDialog from '../components/DepartmentDialog'
import { Alert, EmptyState, PageHeader, Spinner } from '../components/Ui'

const NOT_EMPTY_HINT = 'Move its users to another department first'

// Same order as GET /departments: by name
const byName = (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })

export default function Departments() {
  const [departments, setDepartments] = useState(null) // null until the first load finishes
  const [loadError, setLoadError] = useState('')
  // The open dialog: { type: 'add' } | { type: 'rename', department } | { type: 'delete', department } | null
  const [dialog, setDialog] = useState(null)
  // The button that opened the dialog, so focus goes back to it when the dialog closes
  const trigger = useRef(null)

  useEffect(() => {
    client
      .get('/departments')
      .then(({ data }) => setDepartments(data))
      .catch((err) => setLoadError(errorMessage(err)))
  }, [])

  function openDialog(event, next) {
    trigger.current = event.currentTarget
    setDialog(next)
  }

  function handleSaved(saved) {
    setDepartments((current) => [...current.filter((d) => d.id !== saved.id), saved].sort(byName))
    setDialog(null)
  }

  function handleDeleted(deleted) {
    setDepartments((current) => current.filter((d) => d.id !== deleted.id))
    // The row (and its button) is gone, so focus the Add button instead of dropping to the page
    trigger.current = document.getElementById('add-department')
    setDialog(null)
  }

  // The backend refused the delete because someone is in it now: show the real count, which disables Delete
  function handleRefused(department, userCount) {
    setDepartments((current) => current.map((d) => (d.id === department.id ? { ...d, user_count: userCount } : d)))
  }

  return (
    <>
      <PageHeader
        title="Departments"
        subtitle="The departments people can be put in. Rename them, or delete one once nobody is in it."
        actions={
          <button
            id="add-department"
            type="button"
            className="btn btn--primary"
            onClick={(e) => openDialog(e, { type: 'add' })}
          >
            <Plus size={16} aria-hidden="true" />
            Add department
          </button>
        }
      />

      {(dialog?.type === 'add' || dialog?.type === 'rename') && (
        <DepartmentDialog
          department={dialog.department ?? null}
          onSaved={handleSaved}
          onCancel={() => setDialog(null)}
          returnFocusRef={trigger}
        />
      )}
      {dialog?.type === 'delete' && (
        <DeleteDepartmentDialog
          department={dialog.department}
          onDeleted={handleDeleted}
          onRefused={handleRefused}
          onCancel={() => setDialog(null)}
          returnFocusRef={trigger}
        />
      )}

      <section className="card">
        <div className="results-bar">
          <span>
            {departments === null
              ? loadError
                ? 'Departments could not be loaded'
                : 'Loading departments…'
              : `${departments.length} ${departments.length === 1 ? 'department' : 'departments'}`}
          </span>
        </div>

        {loadError && (
          <div className="card__section">
            <Alert>{loadError}</Alert>
          </div>
        )}

        {departments === null && !loadError ? (
          <Spinner label="Loading departments…" />
        ) : departments?.length === 0 ? (
          <EmptyState icon={Building2} title="No departments yet" />
        ) : (
          departments && (
            <div className="table-wrap">
              <table className="table table--stack table--departments">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th className="table__num">Users</th>
                    <th className="table__actions">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {departments.map((d) => {
                    const userCount = Number(d.user_count) || 0
                    return (
                      <tr key={d.id}>
                        <td>
                          <span className="table__title">{d.name}</span>
                        </td>
                        <td className="table__num" data-label="Users">
                          {userCount}
                        </td>
                        <td className="table__actions">
                          <div className="row-actions">
                            <button
                              type="button"
                              className="btn btn--sm btn--secondary btn--icon"
                              onClick={(e) => openDialog(e, { type: 'rename', department: d })}
                              aria-label={`Rename ${d.name}`}
                              title="Rename"
                            >
                              <Pencil size={14} aria-hidden="true" />
                              <span className="row-actions__text">Rename</span>
                            </button>
                            {/* A disabled button gets no hover in some browsers, so the wrapper carries the tooltip */}
                            <span className="row-actions__wrap" title={userCount > 0 ? NOT_EMPTY_HINT : 'Delete'}>
                              <button
                                type="button"
                                className="btn btn--sm btn--secondary btn--icon"
                                disabled={userCount > 0}
                                onClick={(e) => openDialog(e, { type: 'delete', department: d })}
                                aria-label={`Delete ${d.name}`}
                                aria-describedby={userCount > 0 ? `department-${d.id}-not-empty` : undefined}
                              >
                                <Trash2 size={14} aria-hidden="true" />
                                <span className="row-actions__text">Delete</span>
                              </button>
                              {userCount > 0 && (
                                <span id={`department-${d.id}-not-empty`} className="sr-only">
                                  {NOT_EMPTY_HINT}
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
          )
        )}
      </section>
    </>
  )
}
