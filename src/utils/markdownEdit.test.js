// markdownEdit.test.js – what the editor's formatting buttons do to the text and the selection.
import { applyFormat } from './markdownEdit'

// "a [b] c": the text with the selection marked by [ ], for readable cases
function format(marked, kind) {
  const start = marked.indexOf('[')
  const end = marked.indexOf(']') - 1
  const text = marked.replace('[', '').replace(']', '')
  const result = applyFormat(text, start, end, kind)
  return `${result.text.slice(0, result.start)}[${result.text.slice(result.start, result.end)}]${result.text.slice(result.end)}`
}

test.each([
  ['bold around a word', 'make [this] strong', 'bold', 'make **[this]** strong'],
  ['bold with nothing selected', 'start []', 'bold', 'start **[bold text]**'],
  ['italic', 'an [idea]', 'italic', 'an _[idea]_'],
  ['inline code', 'run [npm ci] now', 'code', 'run `[npm ci]` now'],
  ['a code block from several lines', 'see\n[a\nb]\n', 'code', 'see\n```\n[a\nb]\n```\n'],
  ['a code block mid-line starts on a new line', 'x [a\nb]', 'code', 'x \n```\n[a\nb]\n```'],
  ['a link around the text, with the address selected', 'open [the portal]', 'link', 'open [the portal]([https://])'],
  ['a heading on the current line', 'Ti[]tle\nnext', 'heading', '[## Title]\nnext'],
  ['a bulleted list from lines', '[one\ntwo]', 'bulleted', '[- one\n- two]'],
  ['a numbered list', '[one\ntwo\nthree]', 'numbered', '[1. one\n2. two\n3. three]'],
  ['a list replaces an earlier marker', '[- one\n2. two]', 'numbered', '[1. one\n2. two]'],
])('%s', (_, marked, kind, expected) => {
  expect(format(marked, kind)).toBe(expected)
})

test('an unknown format is an error, not a silent no-op', () => {
  expect(() => applyFormat('x', 0, 0, 'blink')).toThrow('Unknown format: blink')
})
