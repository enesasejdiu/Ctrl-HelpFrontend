// TicketAttachments.test.jsx – the "Attachments" card on a ticket's page: the list with Download links, who may delete
// (the uploader or an admin), the confirm dialog, adding files, and files that failed (handed over by New ticket, or
// failed here) with "Try again". The API is a small in-memory backend (GET /tickets/42, POST
// /tickets/42/attachments, DELETE /attachments/:id).
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import TicketDetail from '../pages/TicketDetail'
import { buildTicket, buildUser } from '../test/factories'
import { renderWithProviders } from '../test/render'
import { API, server } from '../test/server'

const requester = buildUser({ id: 4, name: 'Liridon Gashi', role: 'employee' })
const agent = buildUser({ id: 7, name: 'Arben Krasniqi', role: 'agent' })
const admin = buildUser({ id: 1, name: 'Admin User', role: 'admin' })

const attachment = (id, name, uploader, extra = {}) => ({
  id,
  ticket_id: 42,
  original_name: name,
  mime_type: name.endsWith('.png') ? 'image/png' : 'application/pdf',
  size_bytes: 48213,
  uploaded_by: { id: uploader.id, name: uploader.name },
  created_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
  ...extra,
})

// The backend in memory. Returns { attachments, uploads, deletes } to look at after the test.
function mockBackend({ attachments = [], refuse = {} } = {}) {
  const state = { attachments: [...attachments], uploads: [], deletes: [] }
  let nextId = 100
  server.use(
    http.get(`${API}/tickets/42`, () =>
      HttpResponse.json({
        ...buildTicket({ id: 42, title: 'Printer broken', requester_id: requester.id, requester_name: requester.name }),
        status: 'open',
        resolution: null,
        resolved_at: null,
        target_hours: 72,
        comments: [],
        history: [],
        attachments: state.attachments,
      }),
    ),
    http.get(`${API}/users/agents`, () => HttpResponse.json([])),
    http.post(`${API}/tickets/42/attachments`, async ({ request }) => {
      const [file] = (await request.formData()).getAll('files')
      state.uploads.push(file.name)
      if (refuse[file.name]) return HttpResponse.json(refuse[file.name], { status: refuse[file.name].status })
      const added = attachment(nextId++, file.name, state.uploader ?? requester, { size_bytes: file.size })
      state.attachments.push(added)
      return HttpResponse.json([added], { status: 201 })
    }),
    http.delete(`${API}/attachments/:id`, ({ params }) => {
      const id = Number(params.id)
      state.deletes.push(id)
      if (refuse.delete) return HttpResponse.json(refuse.delete, { status: refuse.delete.status })
      state.attachments = state.attachments.filter((a) => a.id !== id)
      return new HttpResponse(null, { status: 204 })
    }),
  )
  return state
}

function renderTicket(user, { state } = {}) {
  return renderWithProviders(<TicketDetail />, {
    route: state ? { pathname: '/tickets/42', state } : '/tickets/42',
    path: '/tickets/:id',
    user,
    userEventOptions: { applyAccept: false },
  })
}

const card = () => screen.getByRole('region', { name: /^Attachments/ })
const rowFor = (name) => within(card()).getByText(name).closest('li')

describe('Ticket attachments', () => {
  it('lists each file with its size, who added it and when, and a Download link to the API', async () => {
    mockBackend({ attachments: [attachment(7, 'screen.png', requester), attachment(8, 'invoice.pdf', agent)] })
    await renderTicket(requester)

    expect(await screen.findByRole('heading', { name: 'Attachments (2)' })).toBeInTheDocument()
    expect(rowFor('screen.png')).toHaveTextContent('47.1 KB · Liridon Gashi · 5m ago')
    const download = within(rowFor('screen.png')).getByRole('link', { name: 'Download screen.png' })
    expect(download).toHaveAttribute('href', `${API}/attachments/7/download`)
    expect(download).toHaveAttribute('download', 'screen.png')
  })

  it('shows "No files attached yet." when there are none', async () => {
    mockBackend()
    await renderTicket(requester)
    expect(await screen.findByText('No files attached yet.')).toBeInTheDocument()
  })

  describe('who may delete', () => {
    const files = [attachment(7, 'screen.png', requester), attachment(8, 'trace.pdf', agent)]

    it('the requester: only their own file', async () => {
      mockBackend({ attachments: files })
      await renderTicket(requester)
      await screen.findByRole('heading', { name: 'Attachments (2)' })
      expect(within(rowFor('screen.png')).getByRole('button', { name: 'Delete screen.png' })).toBeInTheDocument()
      expect(within(rowFor('trace.pdf')).queryByRole('button', { name: /Delete/ })).not.toBeInTheDocument()
    })

    it('an agent: only their own file (seeing a ticket is not enough to delete its files)', async () => {
      mockBackend({ attachments: files })
      await renderTicket(agent)
      await screen.findByRole('heading', { name: 'Attachments (2)' })
      expect(within(rowFor('screen.png')).queryByRole('button', { name: /Delete/ })).not.toBeInTheDocument()
      expect(within(rowFor('trace.pdf')).getByRole('button', { name: 'Delete trace.pdf' })).toBeInTheDocument()
    })

    it('an admin: every file', async () => {
      mockBackend({ attachments: files })
      await renderTicket(admin)
      await screen.findByRole('heading', { name: 'Attachments (2)' })
      expect(within(card()).getAllByRole('button', { name: /^Delete / })).toHaveLength(2)
    })
  })

  it('Delete asks first: Cancel keeps the file, Delete removes it and updates the list', async () => {
    const backend = mockBackend({ attachments: [attachment(7, 'screen.png', requester)] })
    const { user } = await renderTicket(requester)
    await screen.findByRole('heading', { name: 'Attachments (1)' })

    await user.click(screen.getByRole('button', { name: 'Delete screen.png' }))
    const dialog = screen.getByRole('alertdialog', { name: 'Delete attachment' })
    expect(dialog).toHaveTextContent("Delete screen.png? This can't be undone.")
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(backend.deletes).toEqual([])

    await user.click(screen.getByRole('button', { name: 'Delete screen.png' }))
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete' }))

    expect(await screen.findByRole('heading', { name: 'Attachments (0)' })).toBeInTheDocument()
    expect(backend.deletes).toEqual([7])
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it("a refused delete shows the backend's message in the dialog", async () => {
    mockBackend({
      attachments: [attachment(7, 'screen.png', requester)],
      refuse: { delete: { status: 403, message: 'Only the person who uploaded a file, or an admin, can delete it' } },
    })
    const { user } = await renderTicket(requester)
    await screen.findByRole('heading', { name: 'Attachments (1)' })

    await user.click(screen.getByRole('button', { name: 'Delete screen.png' }))
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete' }))
    expect(await within(screen.getByRole('alertdialog')).findByRole('alert')).toHaveTextContent(
      'Only the person who uploaded a file, or an admin, can delete it',
    )
  })

  it('adds files: choose them, Upload, and the list shows them', async () => {
    const backend = mockBackend()
    const { user } = await renderTicket(requester)
    await screen.findByText('No files attached yet.')

    await user.upload(within(card()).getByLabelText(/Add files/), [
      new File(['a'], 'one.png', { type: 'image/png' }),
      new File(['b'], 'two.pdf', { type: 'application/pdf' }),
    ])
    await user.click(within(card()).getByRole('button', { name: 'Upload 2 files' }))

    expect(await screen.findByRole('heading', { name: 'Attachments (2)' })).toBeInTheDocument()
    expect(backend.uploads).toEqual(['one.png', 'two.pdf'])
    expect(within(card()).getByText('one.png')).toBeInTheDocument()
  })

  it('a file the backend refuses is listed with its reason and "Try again"; the others still upload', async () => {
    const backend = mockBackend({
      refuse: {
        'fake.png': { status: 400, message: "fake.png: this file type isn't allowed", code: 'UNSUPPORTED_FILE_TYPE' },
      },
    })
    const { user } = await renderTicket(requester)
    await screen.findByText('No files attached yet.')

    await user.upload(within(card()).getByLabelText(/Add files/), [
      new File(['text'], 'fake.png', { type: 'image/png' }),
      new File(['b'], 'ok.pdf', { type: 'application/pdf' }),
    ])
    await user.click(within(card()).getByRole('button', { name: 'Upload 2 files' }))

    const warning = await within(card()).findByRole('alert')
    expect(warning).toHaveTextContent("This file wasn't uploaded:")
    expect(warning).toHaveTextContent("fake.png: this file type isn't allowed")
    expect(within(card()).getByRole('heading', { name: 'Attachments (1)' })).toBeInTheDocument()
    expect(backend.uploads).toEqual(['fake.png', 'ok.pdf'])
  })

  it('files that failed on New ticket are shown with "Try again", which uploads them; the hand-over is then forgotten', async () => {
    const backend = mockBackend()
    const failed = new File(['img'], 'screen.png', { type: 'image/png' })
    const { user, router } = await renderTicket(requester, {
      state: { failedUploads: [{ file: failed, error: 'Cannot reach the server. Check that the API is running.' }] },
    })

    const warning = await screen.findByRole('alert')
    expect(warning).toHaveTextContent("This file wasn't uploaded:")
    expect(warning).toHaveTextContent('Cannot reach the server.')
    // Gone from the browser history, so a reload doesn't show it again
    await waitFor(() => expect(router.state.location.state).toBeNull())

    await user.click(within(warning).getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { name: 'Attachments (1)' })).toBeInTheDocument()
    expect(backend.uploads).toEqual(['screen.png'])
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('Dismiss hides the failures without uploading', async () => {
    const backend = mockBackend()
    const { user } = await renderTicket(requester, {
      state: { failedUploads: [{ file: new File(['x'], 'a.png'), error: 'a.png: failed' }] },
    })
    await user.click(await screen.findByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(backend.uploads).toEqual([])
  })

  it('a ticket with 20 files has no dropzone; with 18, at most 2 more can be chosen', async () => {
    const twenty = Array.from({ length: 20 }, (_, i) => attachment(i + 1, `f${i}.pdf`, requester))
    mockBackend({ attachments: twenty })
    const { unmount } = await renderTicket(requester)
    expect(await screen.findByText('This ticket has the maximum of 20 attachments.')).toBeInTheDocument()
    expect(within(card()).queryByLabelText(/Add files/)).not.toBeInTheDocument()
    unmount()

    mockBackend({ attachments: twenty.slice(0, 18) })
    await renderTicket(requester)
    await screen.findByRole('heading', { name: 'Attachments (18)' })
    expect(within(card()).getByLabelText(/Add files/)).toHaveAccessibleDescription(/2 files at most/)
  })
})

describe('thumbnails and comment files', () => {
  it('an image gets a thumbnail from the preview URL (?inline=1); a PDF keeps its icon', async () => {
    mockBackend({ attachments: [attachment(7, 'screen.png', requester), attachment(8, 'invoice.pdf', agent)] })
    await renderTicket(requester)
    await screen.findByRole('heading', { name: 'Attachments (2)' })

    const thumbnail = rowFor('screen.png').querySelector('img')
    expect(thumbnail).toHaveAttribute('src', `${API}/attachments/7/download?inline=1`)
    // Decorative: the file's name is right next to it
    expect(thumbnail).toHaveAttribute('alt', '')
    expect(rowFor('invoice.pdf').querySelector('img')).toBeNull()
  })

  it("a thumbnail that can't be loaded falls back to the icon", async () => {
    mockBackend({ attachments: [attachment(7, 'screen.png', requester)] })
    await renderTicket(requester)
    await screen.findByRole('heading', { name: 'Attachments (1)' })
    fireEvent.error(rowFor('screen.png').querySelector('img'))
    await waitFor(() => expect(rowFor('screen.png').querySelector('img')).toBeNull())
  })

  it('a file that came with a comment says so in the list', async () => {
    mockBackend({ attachments: [attachment(7, 'screen.png', requester, { comment_id: 3 })] })
    await renderTicket(requester)
    await screen.findByRole('heading', { name: 'Attachments (1)' })
    expect(rowFor('screen.png')).toHaveTextContent('with a comment')
  })
})
