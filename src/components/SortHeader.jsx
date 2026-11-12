// SortHeader.jsx – a table column header that sorts the list: a button with the column's name and an arrow, and
// aria-sort on the <th> so screen readers know the current order. Clicking the sorted column flips the order; clicking
// another column sorts by it in its natural first order (newest / most urgent first for dates and priority, A–Z for
// text).
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'

export default function SortHeader({ field, label, sort, order, firstOrder = 'asc', onSort, className }) {
  const active = sort === field
  const current = active ? order || firstOrder : null
  const next = active ? (current === 'asc' ? 'desc' : 'asc') : firstOrder
  const Icon = current === 'asc' ? ArrowUp : current === 'desc' ? ArrowDown : ArrowUpDown
  return (
    <th className={className} aria-sort={current === 'asc' ? 'ascending' : current === 'desc' ? 'descending' : 'none'}>
      <button type="button" className={`sort-button${active ? ' is-active' : ''}`} onClick={() => onSort(field, next)}>
        {label}
        <Icon size={14} aria-hidden="true" />
      </button>
    </th>
  )
}
