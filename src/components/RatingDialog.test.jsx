// RatingDialog.test.jsx – the "How did we do?" dialog: choosing stars (mouse and keyboard), the optional comment,
// what gets sent, Skip, and each error the backend can answer with.
import { screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { buildUser } from '../test/factories'
import { renderWithProviders } from '../test/render'
import { API, server } from '../test/server'
import RatingDialog from './RatingDialog'

const SAVED = { stars: 4, comment: 'Fast fix', created_at: '2026-11-12T10:00:00.000Z' }

async function renderDialog({ reply = () => HttpResponse.json(SAVED, { status: 201 }) } = {}) {
  const requests = []
  server.use(
    http.post(`${API}/tickets/42/rating`, async ({ request }) => {
      requests.push(await request.json())
      return reply()
    }),
  )
  const onSaved = vi.fn()
  const onSkip = vi.fn()
  const view = await renderWithProviders(<RatingDialog ticketId={42} onSaved={onSaved} onSkip={onSkip} />, {
    user: buildUser({ role: 'employee' }),
  })
  return { ...view, requests, onSaved, onSkip, dialog: screen.getByRole('dialog', { name: 'How did we do?' }) }
}

const star = (n) => screen.getByRole('radio', { name: `${n} of 5 stars` })

describe('RatingDialog', () => {
  it('offers five stars in a "Rating" group, each read as "N of 5 stars", and starts on the first one', async () => {
    await renderDialog()

    const group = screen.getByRole('group', { name: 'Rating' })
    expect(group).toBeInTheDocument()
    for (const n of [1, 2, 3, 4, 5]) expect(star(n)).not.toBeChecked()
    expect(star(1)).toHaveFocus()
    expect(screen.getByText('Pick a number of stars')).toBeInTheDocument()
  })

  it('moves between the stars with the arrow keys', async () => {
    const { user } = await renderDialog()

    await user.keyboard('{ArrowRight}{ArrowRight}')
    expect(star(3)).toBeChecked()
    expect(star(3)).toHaveFocus()
    expect(screen.getByText('3 of 5 stars')).toBeInTheDocument()

    await user.keyboard('{ArrowLeft}')
    expect(star(2)).toBeChecked()
  })

  it('previews the stars under the mouse, and a click chooses them', async () => {
    const { user } = await renderDialog()

    await user.hover(star(5).closest('label'))
    expect(screen.getByText('5 of 5 stars')).toBeInTheDocument()
    await user.click(star(4).closest('label'))
    await user.unhover(star(4).closest('label'))
    expect(star(4)).toBeChecked()
    expect(screen.getByText('4 of 5 stars')).toBeInTheDocument()
  })

  it('asks for stars before sending anything', async () => {
    const { user, requests, onSaved } = await renderDialog()

    await user.click(screen.getByRole('button', { name: 'Send' }))

    expect(screen.getByText('Choose from 1 to 5 stars')).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Rating' })).toHaveAttribute('aria-invalid', 'true')
    expect(requests).toEqual([])
    expect(onSaved).not.toHaveBeenCalled()

    await user.click(star(2))
    expect(screen.queryByText('Choose from 1 to 5 stars')).not.toBeInTheDocument()
  })

  it('sends the stars and the trimmed comment, and hands the saved rating on', async () => {
    const { user, requests, onSaved } = await renderDialog()

    await user.click(star(4))
    await user.type(screen.getByLabelText(/Comment/), '  Fast fix  ')
    await user.click(screen.getByRole('button', { name: 'Send' }))

    await vi.waitFor(() => expect(onSaved).toHaveBeenCalledWith(SAVED))
    expect(requests).toEqual([{ stars: 4, comment: 'Fast fix' }])
  })

  it('leaves the comment out when it is empty or only spaces', async () => {
    const { user, requests, onSaved } = await renderDialog()

    await user.click(star(5))
    await user.type(screen.getByLabelText(/Comment/), '   ')
    await user.click(screen.getByRole('button', { name: 'Send' }))

    await vi.waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(requests).toEqual([{ stars: 5 }])
  })

  it('counts the comment up to 500 characters', async () => {
    const { user } = await renderDialog()
    const comment = screen.getByLabelText(/Comment/)

    expect(comment).toHaveAttribute('maxlength', '500')
    await user.type(comment, 'Thanks')
    expect(screen.getByText('6/500')).toBeInTheDocument()
  })

  it('Skip and Escape close it without sending', async () => {
    const { user, requests, onSkip } = await renderDialog()

    await user.click(screen.getByRole('button', { name: 'Skip' }))
    await user.keyboard('{Escape}')

    expect(onSkip).toHaveBeenCalledTimes(2)
    expect(requests).toEqual([])
  })

  it('treats "already rated" (409) as done', async () => {
    const { user, onSaved } = await renderDialog({
      reply: () => HttpResponse.json({ message: 'Already rated', code: 'ALREADY_RATED' }, { status: 409 }),
    })

    await user.click(star(3))
    await user.click(screen.getByRole('button', { name: 'Send' }))

    await vi.waitFor(() => expect(onSaved).toHaveBeenCalledWith(null))
  })

  it("shows the backend's field errors under the fields", async () => {
    const { user, onSaved } = await renderDialog({
      reply: () =>
        HttpResponse.json(
          { message: 'Validation failed', errors: [{ field: 'comment', message: 'Comment is too long' }] },
          { status: 400 },
        ),
    })

    await user.click(star(3))
    await user.click(screen.getByRole('button', { name: 'Send' }))

    expect(await screen.findByText('Comment is too long')).toBeInTheDocument()
    expect(screen.getByLabelText(/Comment/)).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled()
    expect(onSaved).not.toHaveBeenCalled()
  })

  it.each([
    [403, 'Only the requester can rate this ticket'],
    [400, 'Only closed tickets can be rated'],
    [500, 'Something went wrong'],
  ])('shows any other error (%i) above the form and keeps the choice', async (status, message) => {
    const { user, onSaved } = await renderDialog({ reply: () => HttpResponse.json({ message }, { status }) })

    await user.click(star(3))
    await user.click(screen.getByRole('button', { name: 'Send' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(star(3)).toBeChecked()
    expect(onSaved).not.toHaveBeenCalled()
  })
})
