// Highlight.jsx – text with the words of a search marked (<mark>). The text is always React text, so anything in it
// (even "<script>") is shown as written, never as HTML. The parts between the marks are bare text, not elements, so
// the spaces around a mark stay in a link's accessible name ("VPN says…", not "VPNsays…").
import { Fragment } from 'react'
import { highlightParts } from '../../utils/kb'

export default function Highlight({ text, query }) {
  return highlightParts(text, query).map((part, index) =>
    part.match ? <mark key={index}>{part.text}</mark> : <Fragment key={index}>{part.text}</Fragment>,
  )
}
