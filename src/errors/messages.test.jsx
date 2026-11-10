// messages.test.jsx – the error screen still has its text when i18n is what broke.
import { render, screen } from '@testing-library/react'
import ErrorFallback from './ErrorFallback'
import { errorText } from './messages'

vi.mock('../i18n', () => ({
  t: () => {
    throw new Error('i18n broke')
  },
}))

it('falls back to plain English when t() throws', () => {
  expect(errorText('error.title')).toBe('Something went wrong')
})

it('the fallback renders with those defaults', () => {
  render(<ErrorFallback referenceId="ABCD1234" onRetry={() => {}} onHome={() => {}} showDetails={false} />)
  expect(screen.getByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument()
  expect(
    screen.getByText('An unexpected error occurred. You can try again, or go back to the home page.'),
  ).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Go to home page' })).toBeInTheDocument()
})
