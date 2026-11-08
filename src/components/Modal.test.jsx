// Modal.test.jsx – focus handling, checked inside StrictMode like the real app (main.jsx), because StrictMode
// runs effects twice in development and once broke "focus the first field".
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode, useState } from 'react'
import Modal from './Modal'

function Page() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      {open && (
        <Modal title="Test dialog" onClose={() => setOpen(false)}>
          <button type="button">First</button>
          <input aria-label="Wanted first" data-autofocus />
        </Modal>
      )}
    </>
  )
}

describe('Modal', () => {
  it('focuses the data-autofocus control, and returns focus to the opener on Escape (in StrictMode)', async () => {
    const user = userEvent.setup()
    render(
      <StrictMode>
        <Page />
      </StrictMode>,
    )

    await user.click(screen.getByRole('button', { name: 'Open' }))
    expect(screen.getByRole('dialog', { name: 'Test dialog' })).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByLabelText('Wanted first')).toHaveFocus()
    expect(document.body.style.overflow).toBe('hidden')

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open' })).toHaveFocus()
    expect(document.body.style.overflow).toBe('')
  })

  it('focuses the first control when nothing is marked', async () => {
    const user = userEvent.setup()
    render(
      <StrictMode>
        <Modal title="Plain">
          <button type="button">Only button</button>
        </Modal>
      </StrictMode>,
    )
    expect(screen.getByRole('button', { name: 'Only button' })).toHaveFocus()
    // No onClose: Escape keeps it open
    await user.keyboard('{Escape}')
    expect(screen.getByRole('dialog', { name: 'Plain' })).toBeInTheDocument()
  })
})
