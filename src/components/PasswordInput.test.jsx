// PasswordInput.test.jsx – the show/hide button toggles the password between hidden and visible.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PasswordInput from './PasswordInput'

describe('PasswordInput', () => {
  it('shows and hides the password when the toggle is clicked', async () => {
    const user = userEvent.setup()
    render(
      <>
        <label htmlFor="password">Password</label>
        <PasswordInput id="password" />
      </>,
    )

    const input = screen.getByLabelText('Password')
    expect(input).toHaveAttribute('type', 'password')

    await user.click(screen.getByRole('button', { name: 'Show password' }))
    expect(input).toHaveAttribute('type', 'text')

    await user.click(screen.getByRole('button', { name: 'Hide password' }))
    expect(input).toHaveAttribute('type', 'password')
    expect(screen.getByRole('button', { name: 'Show password' })).toBeInTheDocument()
  })
})
