// Pagination.jsx – the controls under a paged list: "Page 2 of 6", Previous / Next, and how many rows a page has
// (25 / 50 / 100). The parent keeps page and pageSize in the URL (utils/pagination.js) and shows "Showing 26–50 of 132"
// in its results bar, which screen readers announce.
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useId } from 'react'
import { PAGE_SIZES, pageCount } from '../utils/pagination'

export default function Pagination({ page, pageSize, total, onPage, onPageSize, label = 'Pages' }) {
  const id = useId()
  const pages = pageCount(total, pageSize)
  return (
    <nav className="pagination" aria-label={label}>
      <div className="pagination__pages">
        <button
          type="button"
          className="btn btn--sm btn--secondary"
          onClick={() => onPage(page - 1)}
          disabled={page <= 1}
        >
          <ChevronLeft size={14} aria-hidden="true" />
          Previous
        </button>
        <span className="pagination__current" aria-current="page">
          Page {Math.min(page, pages)} of {pages}
        </span>
        <button
          type="button"
          className="btn btn--sm btn--secondary"
          onClick={() => onPage(page + 1)}
          disabled={page >= pages}
        >
          Next
          <ChevronRight size={14} aria-hidden="true" />
        </button>
      </div>
      <label className="pagination__size" htmlFor={id}>
        Per page
        <select
          id={id}
          className="select select--sm"
          value={pageSize}
          onChange={(event) => onPageSize(Number(event.target.value))}
        >
          {PAGE_SIZES.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </label>
    </nav>
  )
}
