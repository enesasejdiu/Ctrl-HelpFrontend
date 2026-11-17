// markdownEdit.js – what the editor's formatting buttons do to the Markdown text: wrap the selection (bold, italic,
// code, link) or prefix the selected lines (heading, lists). Pure functions, so the textarea only applies the result.
//
// applyFormat(text, start, end, kind) → { text, start, end }: the new text and what to select afterwards (the
// formatted words, or the placeholder to type over when nothing was selected).

const WRAPS = {
  bold: { mark: '**', placeholder: 'bold text' },
  italic: { mark: '_', placeholder: 'italic text' },
}

function wrap(text, start, end, mark, placeholder) {
  const selected = text.slice(start, end) || placeholder
  const next = `${text.slice(0, start)}${mark}${selected}${mark}${text.slice(end)}`
  const from = start + mark.length
  return { text: next, start: from, end: from + selected.length }
}

// The whole lines the selection touches: [lineStart, lineEnd)
function lineRange(text, start, end) {
  const lineStart = text.lastIndexOf('\n', start - 1) + 1
  const newline = text.indexOf('\n', end > start && text[end - 1] === '\n' ? end - 1 : end)
  return [lineStart, newline === -1 ? text.length : newline]
}

function prefixLines(text, start, end, prefixFor) {
  const [from, to] = lineRange(text, start, end)
  const lines = text.slice(from, to).split('\n')
  // Strip an earlier heading/list marker first, so a line never gets two ("- 1. item")
  const formatted = lines.map((line, index) => `${prefixFor(index)}${line.replace(/^(#{1,6} |[-*+] |\d+[.)] )/, '')}`)
  const block = formatted.join('\n')
  return { text: `${text.slice(0, from)}${block}${text.slice(to)}`, start: from, end: from + block.length }
}

export function applyFormat(text, start, end, kind) {
  if (WRAPS[kind]) return wrap(text, start, end, WRAPS[kind].mark, WRAPS[kind].placeholder)

  if (kind === 'code') {
    const selected = text.slice(start, end)
    // Several lines become a code block, a word or none inline code
    if (selected.includes('\n')) {
      const code = selected.replace(/\n$/, '')
      const block = `\`\`\`\n${code}\n\`\`\``
      const before = start > 0 && text[start - 1] !== '\n' ? '\n' : ''
      // The code itself stays selected (after the newline, if one was added, and the opening "```\n")
      const from = start + before.length + 4
      return {
        text: `${text.slice(0, start)}${before}${block}${text.slice(end)}`,
        start: from,
        end: from + code.length,
      }
    }
    return wrap(text, start, end, '`', 'code')
  }

  if (kind === 'link') {
    const label = text.slice(start, end) || 'link text'
    const url = 'https://'
    const inserted = `[${label}](${url})`
    // Select the address, ready to paste over
    const urlStart = start + label.length + 3
    return { text: `${text.slice(0, start)}${inserted}${text.slice(end)}`, start: urlStart, end: urlStart + url.length }
  }

  if (kind === 'heading') return prefixLines(text, start, end, () => '## ')
  if (kind === 'bulleted') return prefixLines(text, start, end, () => '- ')
  if (kind === 'numbered') return prefixLines(text, start, end, (index) => `${index + 1}. `)

  throw new Error(`Unknown format: ${kind}`)
}
