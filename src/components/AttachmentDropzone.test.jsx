// AttachmentDropzone.test.jsx – choosing files (picker and drag and drop), the list with Remove, and the browser's own
// checks: type, size, empty, how many, duplicates. Rendered in a small wrapper that holds the list, like the pages do.
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import AttachmentDropzone from './AttachmentDropzone'

// A File of `size` bytes without really allocating it
function file(name, size = 1200, type = '') {
  const f = new File(['x'], name, { type, lastModified: 1 })
  Object.defineProperty(f, 'size', { value: size })
  return f
}

function Wrapper({ max, disabled, onChange }) {
  const [files, setFiles] = useState([])
  return (
    <AttachmentDropzone
      label="Attachments"
      files={files}
      max={max}
      disabled={disabled}
      onChange={(next) => {
        setFiles(next)
        onChange?.(next)
      }}
    />
  )
}

// applyAccept: false, so a refused type reaches the component like a file dropped from the desktop would
function setup(props) {
  const user = userEvent.setup({ applyAccept: false })
  render(<Wrapper {...props} />)
  return { user, input: screen.getByLabelText(/Attachments/) }
}

const chosen = () =>
  within(screen.queryByRole('list', { name: 'Chosen files' }) ?? document.createElement('ul'))
    .queryAllByRole('listitem')
    .map((item) => item.textContent)

describe('AttachmentDropzone', () => {
  it('a labelled file input that the keyboard reaches, with the allowed types and limits as its hint', async () => {
    const { user, input } = setup()
    await user.tab()
    expect(input).toHaveFocus()
    expect(input).toHaveAttribute('type', 'file')
    expect(input).toHaveAttribute('multiple')
    expect(input).toHaveAttribute('accept', '.png,.jpg,.jpeg,.gif,.webp,.pdf,.txt,.log,.csv')
    expect(input).toHaveAccessibleDescription(
      /PNG, JPG, GIF, WebP, PDF, TXT, LOG or CSV · up to 10 MB each · 5 files at most/,
    )
  })

  it('lists the chosen files with their size, and Remove takes one out', async () => {
    const onChange = vi.fn()
    const { user, input } = setup({ onChange })
    await user.upload(input, [file('photo.png', 48213, 'image/png'), file('invoice.pdf', 1024 * 1024 * 2)])

    expect(chosen()).toEqual(['photo.png47.1 KB', 'invoice.pdf2 MB'])
    await user.click(screen.getByRole('button', { name: 'Remove photo.png' }))
    expect(chosen()).toEqual(['invoice.pdf2 MB'])
    expect(onChange).toHaveBeenLastCalledWith([expect.objectContaining({ name: 'invoice.pdf' })])
  })

  it('takes files dropped on it, and highlights while something is dragged over it', () => {
    setup()
    const zone = screen.getByTestId('dropzone')
    fireEvent.dragEnter(zone, { dataTransfer: { files: [] } })
    expect(zone).toHaveClass('is-dragging')
    fireEvent.drop(zone, { dataTransfer: { files: [file('log.txt', 300)] } })
    expect(zone).not.toHaveClass('is-dragging')
    expect(chosen()).toEqual(['log.txt300 bytes'])
  })

  it.each([
    ['invoice.exe', 2000, "invoice.exe: this file type isn't allowed"],
    ['README', 2000, "README: this file type isn't allowed"],
    ['photo.png', 10 * 1024 * 1024 + 1, 'photo.png is larger than 10 MB'],
    ['empty.txt', 0, 'empty.txt is empty'],
  ])('refuses %s with its own message, and does not add it', async (name, size, message) => {
    const { user, input } = setup()
    await user.upload(input, [file(name, size), file('ok.pdf', 100)])

    expect(screen.getByRole('alert')).toHaveTextContent(message)
    expect(chosen()).toEqual(['ok.pdf100 bytes'])
  })

  it('a file of exactly 10 MB is fine', async () => {
    const { user, input } = setup()
    await user.upload(input, [file('big.png', 10 * 1024 * 1024)])
    expect(chosen()).toEqual(['big.png10 MB'])
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('stops at `max` files and says so for the rest', async () => {
    const { user, input } = setup({ max: 2 })
    await user.upload(input, [file('a.png', 10), file('b.png', 10), file('c.png', 10)])

    expect(chosen()).toEqual(['a.png10 bytes', 'b.png10 bytes'])
    expect(screen.getByRole('alert')).toHaveTextContent('c.png: you can add at most 2 files here')
    // Full: the zone is disabled until one is removed
    expect(input).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Remove a.png' }))
    expect(input).toBeEnabled()
  })

  it('the same file twice is only listed once', async () => {
    const { user, input } = setup()
    const same = file('a.png', 10)
    await user.upload(input, [same])
    await user.upload(input, [same])
    expect(chosen()).toEqual(['a.png10 bytes'])
  })

  it('disabled: no picking, no dropping, no removing', () => {
    render(<Wrapper disabled />)
    expect(screen.getByLabelText(/Attachments/)).toBeDisabled()
    fireEvent.drop(screen.getByTestId('dropzone'), { dataTransfer: { files: [file('a.png', 10)] } })
    expect(chosen()).toEqual([])
  })
})
