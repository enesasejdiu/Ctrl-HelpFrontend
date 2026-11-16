// TicketComments.test.jsx – files with comments on a ticket's page: choosing files in the comment form, uploading them
// with the new comment's comment_id after it is saved, what happens when one fails, and the files listed under their
// comment. The API is a small in-memory backend (GET /tickets/42, POST /tickets/42/comments, POST
// /tickets/42/attachments).
import { screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { buildTicket, buildUser } from '../test/factories'
import { renderWithProviders } from '../test/render'
import { API, server } from '../test/server'
import TicketDetail from './TicketDetail'

const requester = buildUser({ id: 4, name: 'Liridon Gashi', role: 'employee' })
const agent = buildUser({ id: 7, name: 'Arben Krasniqi', role: 'agent' })

const fileWith = (id, name, commentId) => ({
  id,
  ticket_id: 42,
  comment_id: commentId,
  original_name: name,
  mime_type: name.endsWith('.png') ? 'image/png' : 'text/plain',
  size_bytes: 1200,
  sha256: 'a'.repeat(64),
  uploaded_by: { id: requester.id, name: requester.name },
  created_at: new Date().toISOString(),
})

// The backend in memory. Returns what it received, to look at after the test.
function mockBackend({ comments = [], attachments = [], refuse = {}, commentFails = false } = {}) {
  const state = { comments: [...comments], attachments: [...attachments], posts: [], uploads: [] }
  let nextId = 50
  server.use(
    http.get(`${API}/tickets/42`, () =>
      HttpResponse.json({
        ...buildTicket({ id: 42, title: 'Printer broken', requester_id: requester.id, requester_name: requester.name }),
        status: 'open',
        resolution: null,
        resolved_at: null,
        target_hours: 72,
        comments: state.comments,
        history: [],
        attachments: state.attachments,
      }),
    ),
    http.get(`${API}/users/agents`, () => HttpResponse.json([])),
    http.post(`${API}/tickets/42/comments`, async ({ request }) => {
      const body = await request.json()
      state.posts.push(body)
      if (commentFails) return HttpResponse.json({ message: 'Comments are closed' }, { status: 400 })
      const comment = {
        id: nextId++,
        content: body.content,
        is_internal: body.is_internal,
        author_name: requester.name,
        author_role: 'employee',
        created_at: new Date().toISOString(),
      }
      state.comments.push(comment)
      return HttpResponse.json(comment, { status: 201 })
    }),
    http.post(`${API}/tickets/42/attachments`, async ({ request }) => {
      const form = await request.formData()
      const [file] = form.getAll('files')
      const commentId = form.get('comment_id')
      state.uploads.push({ name: file.name, commentId })
      if (refuse[file.name]) return HttpResponse.json(refuse[file.name], { status: refuse[file.name].status })
      const added = fileWith(nextId++, file.name, commentId ? Number(commentId) : null)
      state.attachments.push(added)
      return HttpResponse.json([added], { status: 201 })
    }),
  )
  return state
}

function renderTicket(user) {
  return renderWithProviders(<TicketDetail />, {
    route: '/tickets/42',
    path: '/tickets/:id',
    user,
    userEventOptions: { applyAccept: false },
  })
}

const commentsCard = () => screen.getByRole('heading', { name: /^Comments/ }).closest('section')
const png = (name) => new File(['png-bytes'], name, { type: 'image/png' })

describe('files with a comment', () => {
  it('lists the files that came with a comment under it, as download links', async () => {
    mockBackend({
      comments: [
        {
          id: 3,
          content: 'Here is the error',
          is_internal: false,
          author_name: requester.name,
          author_role: 'employee',
          created_at: new Date().toISOString(),
        },
      ],
      attachments: [fileWith(9, 'error.png', 3), fileWith(10, 'other.txt', null)],
    })
    await renderTicket(requester)
    await screen.findByRole('heading', { name: /^Comments/ })

    const files = within(commentsCard()).getByRole('list', { name: 'Files with this comment' })
    const link = within(files).getByRole('link', { name: 'Download error.png' })
    expect(link).toHaveAttribute('href', `${API}/attachments/9/download`)
    // A file on the ticket itself isn't under the comment
    expect(within(files).queryByText('other.txt')).not.toBeInTheDocument()
  })

  it('"Attach files" opens a dropzone; the comment is saved first, then each file with its comment_id', async () => {
    const state = mockBackend()
    const { user } = await renderTicket(requester)

    await user.type(await screen.findByRole('textbox', { name: 'Comment' }), 'Photo of the error attached')
    await user.click(screen.getByRole('button', { name: 'Attach files' }))
    await user.upload(within(commentsCard()).getByLabelText(/Files/), [png('error.png'), png('screen.png')])
    await user.click(screen.getByRole('button', { name: 'Add comment + 2 files' }))

    await waitFor(() => expect(state.uploads).toHaveLength(2))
    const [comment] = state.comments
    expect(state.posts).toEqual([{ content: 'Photo of the error attached', is_internal: false }])
    expect(state.uploads).toEqual([
      { name: 'error.png', commentId: String(comment.id) },
      { name: 'screen.png', commentId: String(comment.id) },
    ])
    // After the reload: the files are under the new comment, and the form is empty again
    const files = await within(commentsCard()).findByRole('list', { name: 'Files with this comment' })
    expect(within(files).getAllByRole('link')).toHaveLength(2)
    expect(screen.getByRole('textbox', { name: 'Comment' })).toHaveValue('')
    expect(screen.getByRole('button', { name: 'Add comment' })).toBeInTheDocument()
  })

  it('a file the backend refuses: the comment stays, and the form says which file was not attached', async () => {
    const state = mockBackend({
      refuse: {
        'screen.png': {
          status: 415,
          code: 'UNSUPPORTED_FILE_TYPE',
          message: "screen.png: this file type isn't allowed",
        },
      },
    })
    const { user } = await renderTicket(requester)

    await user.type(await screen.findByRole('textbox', { name: 'Comment' }), 'Two screenshots')
    await user.click(screen.getByRole('button', { name: 'Attach files' }))
    await user.upload(within(commentsCard()).getByLabelText(/Files/), [png('error.png'), png('screen.png')])
    await user.click(screen.getByRole('button', { name: 'Add comment + 2 files' }))

    expect(await screen.findByText(/The comment was added, but this file was not attached/)).toBeInTheDocument()
    expect(screen.getByText("screen.png: this file type isn't allowed")).toBeInTheDocument()
    expect(state.comments).toHaveLength(1)
    expect(state.attachments.map((file) => file.original_name)).toEqual(['error.png'])
  })

  it('when the comment itself fails, nothing is uploaded and the text and files stay', async () => {
    const state = mockBackend({ commentFails: true })
    const { user } = await renderTicket(requester)

    await user.type(await screen.findByRole('textbox', { name: 'Comment' }), 'Will not save')
    await user.click(screen.getByRole('button', { name: 'Attach files' }))
    await user.upload(within(commentsCard()).getByLabelText(/Files/), [png('error.png')])
    await user.click(screen.getByRole('button', { name: 'Add comment + 1 file' }))

    expect(await screen.findByText('Comments are closed')).toBeInTheDocument()
    expect(state.uploads).toEqual([])
    expect(screen.getByRole('textbox', { name: 'Comment' })).toHaveValue('Will not save')
    expect(screen.getByRole('button', { name: 'Add comment + 1 file' })).toBeInTheDocument()
  })

  it('staff writing an internal note see that its files are staff-only too', async () => {
    mockBackend()
    const { user } = await renderTicket(agent)

    await user.click(await screen.findByRole('checkbox', { name: 'Internal note' }))
    await user.click(screen.getByRole('button', { name: 'Attach files' }))
    expect(within(commentsCard()).getByText('Files (staff only, like the note)')).toBeInTheDocument()
  })

  it('a ticket that already has 20 files offers no "Attach files"', async () => {
    mockBackend({ attachments: Array.from({ length: 20 }, (_, i) => fileWith(100 + i, `f${i}.txt`, null)) })
    await renderTicket(requester)
    await screen.findByRole('textbox', { name: 'Comment' })
    expect(screen.queryByRole('button', { name: 'Attach files' })).not.toBeInTheDocument()
  })
})
