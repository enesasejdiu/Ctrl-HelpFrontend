// SortSelect.jsx – the sort as one dropdown, for phones: there the table's header row (with the sortable column
// headers, SortHeader.jsx) is hidden because each row becomes a card. Same values as the headers: sort and order.
import { useId } from 'react'

const ORDER_WORDS = { asc: '↑', desc: '↓' }

export default function SortSelect({ fields, sort, order, firstOrder, onSort }) {
  const id = useId()
  const value = sort ? `${sort}:${order || firstOrder[sort]}` : ''
  return (
    <label className="sort-select" htmlFor={id}>
      Sort by
      <select
        id={id}
        className="select select--sm"
        value={value}
        onChange={(event) => {
          const [field, direction] = event.target.value.split(':')
          onSort(field || '', direction || '')
        }}
      >
        <option value="">Default order</option>
        {fields.flatMap(({ field, label }) =>
          ['asc', 'desc'].map((direction) => (
            <option key={`${field}:${direction}`} value={`${field}:${direction}`}>
              {label} {ORDER_WORDS[direction]}
            </option>
          )),
        )}
      </select>
    </label>
  )
}
