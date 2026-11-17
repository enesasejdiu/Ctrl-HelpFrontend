// insertText.test.js – inserting into a textarea: at the cursor, over a selection, over a given range; the cursor ends
// after the text; execCommand('insertText') is used when the browser has it (so undo works), setRangeText otherwise,
// and both tell React (an input event).
import { insertText } from './insertText'

function textarea(value, start, end = start) {
  const element = document.createElement('textarea')
  element.value = value
  document.body.append(element)
  element.setSelectionRange(start, end)
  return element
}

afterEach(() => {
  document.body.innerHTML = ''
  delete document.execCommand
})

test('at the cursor; the cursor ends after the text; an input event is sent; it has focus', () => {
  const box = textarea('Hello world', 6)
  const onInput = vi.fn()
  box.addEventListener('input', onInput)
  insertText(box, 'big ')
  expect(box.value).toBe('Hello big world')
  expect([box.selectionStart, box.selectionEnd]).toEqual([10, 10])
  expect(onInput).toHaveBeenCalledTimes(1)
  expect(box).toHaveFocus()
})

test('over the selection', () => {
  const box = textarea('Hello world', 6, 11)
  insertText(box, 'there')
  expect(box.value).toBe('Hello there')
})

test('over a given range (the "/" that opened the picker)', () => {
  const box = textarea('/', 1)
  insertText(box, 'Hi!', { from: 0, to: 1 })
  expect(box.value).toBe('Hi!')
  expect(box.selectionStart).toBe(3)
})

test("uses the browser's insertText command when it has one, so Ctrl+Z can undo it", () => {
  const box = textarea('ab', 1)
  document.execCommand = vi.fn((command, _ui, text) => {
    box.setRangeText(text, box.selectionStart, box.selectionEnd, 'end')
    return true
  })
  insertText(box, 'X')
  expect(document.execCommand).toHaveBeenCalledWith('insertText', false, 'X')
  expect(box.value).toBe('aXb')
})

test('falls back to setRangeText when the command is refused', () => {
  const box = textarea('ab', 1)
  document.execCommand = vi.fn(() => false)
  insertText(box, 'X')
  expect(box.value).toBe('aXb')
})
