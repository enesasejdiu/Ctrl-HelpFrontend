// NewTicket.test.jsx – the "report a problem" form: fields, validation, payload, errors and double-submit protection.
import { screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { buildUser } from '../test/factories'
import { renderWithProviders } from '../test/render'
import { API, deferred, server } from '../test/server'
import NewTicket from './NewTicket'

// Records each POST /tickets body and answers with `respond(body)`
function mockCreate(respond = () => HttpResponse.json({ id: 99 }, { status: 201 })) {
  const requests = []
  server.use(
    http.post(`${API}/tickets`, async ({ request }) => {
      const body = await request.json()
      requests.push(body)
      return respond(body)
    }),
  )
  return requests
}

const titleField = () => screen.getByRole('textbox', { name: 'Title' })
const descriptionField = () => screen.getByRole('textbox', { name: 'Description' })
const submitButton = () => screen.getByRole('button', { name: /submit/i })

async function renderForm() {
  const result = await renderWithProviders(<NewTicket />, { route: '/tickets/new', user: buildUser() })
  await screen.findByRole('combobox', { name: 'Category' })
  return result
}

async function fillValidForm(user) {
  await user.type(titleField(), '  Laptop will not boot  ')
  await user.selectOptions(screen.getByRole('combobox', { name: 'Category' }), 'Hardware')
  await user.click(screen.getByRole('radio', { name: /high/i }))
  await user.type(descriptionField(), 'Black screen since this morning.')
}

describe('NewTicket', () => {
  it('shows a loader until the form data has loaded', async () => {
    await renderWithProviders(<NewTicket />, { route: '/tickets/new', user: buildUser() })

    expect(screen.getByRole('status')).toHaveTextContent('Loading form…')
    expect(await screen.findByRole('combobox', { name: 'Category' })).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('renders all fields, with Medium preselected as the priority', async () => {
    await renderForm()

    expect(titleField()).toHaveValue('')
    expect(titleField()).toHaveAccessibleDescription('Up to 150 characters')
    const category = screen.getByRole('combobox', { name: 'Category' })
    expect(
      within(category)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Choose a category…', 'Hardware', 'Software', 'Network', 'Access', 'Email', 'Other'])

    const priority = screen.getByRole('group', { name: 'Priority' })
    expect(within(priority).getAllByRole('radio')).toHaveLength(4)
    expect(within(priority).getByRole('radio', { name: /medium/i })).toBeChecked()
    expect(within(priority).getByText('Target: 4 hours')).toBeInTheDocument()

    expect(descriptionField()).toHaveValue('')
    expect(submitButton()).toHaveTextContent('Submit ticket')
    expect(screen.getByRole('link', { name: 'Cancel' })).toHaveAttribute('href', '/tickets')
  })

  it('describes the chosen category', async () => {
    const { user } = await renderForm()

    await user.selectOptions(screen.getByRole('combobox', { name: 'Category' }), 'Network')

    expect(screen.getByText('Wi-Fi, cabling, internet and network outages')).toBeInTheDocument()
  })

  it('blocks submitting an empty form', async () => {
    const requests = mockCreate()
    const { user } = await renderForm()

    await user.click(submitButton())

    expect(screen.getByRole('alert')).toHaveTextContent('Please fill in the title, category, priority and description')
    expect(titleField()).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('combobox', { name: 'Category' })).toHaveAttribute('aria-invalid', 'true')
    expect(descriptionField()).toHaveAttribute('aria-invalid', 'true')
    expect(requests).toHaveLength(0)
  })

  it('stops marking a field invalid once it is filled in', async () => {
    const { user } = await renderForm()
    await user.click(submitButton())

    await user.type(titleField(), 'Printer offline')

    expect(titleField()).not.toHaveAttribute('aria-invalid')
    expect(descriptionField()).toHaveAttribute('aria-invalid', 'true')
  })

  it('treats a title or description of only spaces as empty', async () => {
    const requests = mockCreate()
    const { user } = await renderForm()

    await user.type(titleField(), '   ')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Category' }), 'Hardware')
    await user.type(descriptionField(), '   ')
    await user.click(submitButton())

    expect(screen.getByRole('alert')).toHaveTextContent('Please fill in')
    expect(titleField()).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('combobox', { name: 'Category' })).not.toHaveAttribute('aria-invalid')
    expect(requests).toHaveLength(0)
  })

  it('limits the title to 150 characters and counts them', async () => {
    const { user } = await renderForm()

    await user.click(titleField())
    await user.paste('x'.repeat(160))

    expect(titleField()).toHaveValue('x'.repeat(150))
    expect(screen.getByText('150/150')).toBeInTheDocument()
  })

  it('sends a trimmed payload with numeric ids and opens the new ticket', async () => {
    const requests = mockCreate()
    const { user, router } = await renderForm()

    await fillValidForm(user)
    await user.click(submitButton())

    expect(await screen.findByRole('heading', { name: 'Ticket 99' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/tickets/99')
    expect(requests).toEqual([
      {
        title: 'Laptop will not boot',
        description: 'Black screen since this morning.',
        category_id: 1,
        priority_id: 3,
      },
    ])
  })

  it('shows the API error and keeps what the user typed', async () => {
    mockCreate(() => HttpResponse.json({ message: 'Invalid category' }, { status: 400 }))
    const { user, router } = await renderForm()

    await fillValidForm(user)
    await user.click(submitButton())

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid category')
    expect(router.state.location.pathname).toBe('/tickets/new')
    expect(titleField()).toHaveValue('  Laptop will not boot  ')
    expect(screen.getByRole('combobox', { name: 'Category' })).toHaveValue('1')
    expect(screen.getByRole('radio', { name: /high/i })).toBeChecked()
    expect(descriptionField()).toHaveValue('Black screen since this morning.')
    expect(submitButton()).toBeEnabled()
  })

  it('cannot be submitted twice while saving', async () => {
    const gate = deferred()
    const requests = mockCreate(async () => {
      await gate.promise
      return HttpResponse.json({ id: 99 }, { status: 201 })
    })
    const { user } = await renderForm()

    await fillValidForm(user)
    await user.click(submitButton())

    expect(submitButton()).toBeDisabled()
    expect(submitButton()).toHaveTextContent('Submitting…')
    await user.click(submitButton())

    gate.resolve()
    expect(await screen.findByRole('heading', { name: 'Ticket 99' })).toBeInTheDocument()
    expect(requests).toHaveLength(1)
  })

  it('shows an error instead of the form when the form data cannot be loaded', async () => {
    server.use(
      http.get(`${API}/meta`, () =>
        HttpResponse.json({ message: 'Something went wrong on the server' }, { status: 500 }),
      ),
    )
    await renderWithProviders(<NewTicket />, { route: '/tickets/new', user: buildUser() })

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong on the server')
    expect(screen.queryByRole('button', { name: /submit/i })).not.toBeInTheDocument()
  })
})

// ---- Attachments: the ticket is created first, then each file is uploaded on its own ----
describe('NewTicket attachments', () => {
  const pngFile = () => new File(['png-bytes'], 'screen.png', { type: 'image/png' })
  const pdfFile = () => new File(['%PDF-1.4'], 'invoice.pdf', { type: 'application/pdf' })

  // POST /tickets/99/attachments, one file per request (field "files"); `refuse` names files the backend refuses.
  // Returns the uploaded file names, in order.
  function mockUploads({ refuse = {}, hold } = {}) {
    const uploaded = []
    server.use(
      http.post(`${API}/tickets/99/attachments`, async ({ request }) => {
        const form = await request.formData()
        const files = form.getAll('files')
        expect(files).toHaveLength(1)
        const [sent] = files
        if (hold) await hold.promise
        if (refuse[sent.name]) return HttpResponse.json(refuse[sent.name], { status: refuse[sent.name].status })
        uploaded.push(sent.name)
        return HttpResponse.json(
          [{ id: uploaded.length, original_name: sent.name, mime_type: sent.type, size_bytes: sent.size }],
          { status: 201 },
        )
      }),
    )
    return uploaded
  }

  async function renderWithFiles(files) {
    const result = await renderForm()
    await fillValidForm(result.user)
    await result.user.upload(screen.getByLabelText(/Attachments/), files)
    return result
  }

  it('the dropzone sits under Description and is optional', async () => {
    await renderForm()
    const description = descriptionField()
    const dropzone = screen.getByLabelText(/Attachments/)
    // eslint-disable-next-line no-bitwise
    expect(description.compareDocumentPosition(dropzone) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByText('Optional', { selector: '.dropzone-field .field__optional' })).toBeInTheDocument()
  })

  it('creates the ticket, then uploads every file, then opens the ticket', async () => {
    const created = mockCreate()
    const uploaded = mockUploads()
    const { user, router } = await renderWithFiles([pngFile(), pdfFile()])

    await user.click(submitButton())

    expect(await screen.findByRole('heading', { name: 'Ticket 99' })).toBeInTheDocument()
    expect(created).toHaveLength(1)
    expect(uploaded).toEqual(['screen.png', 'invoice.pdf'])
    expect(router.state.location.state).toBeNull()
  })

  it("shows each file's progress while uploading, and the button says so", async () => {
    mockCreate()
    const hold = deferred()
    mockUploads({ hold })
    const { user } = await renderWithFiles([pngFile()])

    await user.click(submitButton())

    const progress = await screen.findByRole('list', { name: 'Uploading attachments' })
    expect(within(progress).getByText('screen.png')).toBeInTheDocument()
    expect(within(progress).getByRole('progressbar', { name: 'Uploading screen.png' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Uploading files…' })).toBeDisabled()
    hold.resolve()
    expect(await screen.findByRole('heading', { name: 'Ticket 99' })).toBeInTheDocument()
  })

  it('a refused file does not stop the others; the ticket page gets the failures (with the reason) to try again', async () => {
    mockCreate()
    const uploaded = mockUploads({
      refuse: {
        'screen.png': {
          status: 400,
          message: "screen.png: this file type isn't allowed",
          code: 'UNSUPPORTED_FILE_TYPE',
        },
      },
    })
    const { user, router } = await renderWithFiles([pngFile(), pdfFile()])

    await user.click(submitButton())

    expect(await screen.findByRole('heading', { name: 'Ticket 99' })).toBeInTheDocument()
    expect(uploaded).toEqual(['invoice.pdf'])
    const { failedUploads } = router.state.location.state
    expect(failedUploads).toHaveLength(1)
    expect(failedUploads[0].file.name).toBe('screen.png')
    expect(failedUploads[0].error).toBe("screen.png: this file type isn't allowed")
  })

  it('a 413 names the file and the limit the backend sent', async () => {
    mockCreate()
    mockUploads({
      refuse: {
        'screen.png': {
          status: 413,
          message: 'Each file can be at most 200 KB',
          code: 'FILE_TOO_LARGE',
          max_bytes: 204800,
        },
      },
    })
    const { user, router } = await renderWithFiles([pngFile()])

    await user.click(submitButton())
    await screen.findByRole('heading', { name: 'Ticket 99' })
    expect(router.state.location.state.failedUploads[0].error).toBe('screen.png is larger than 200 KB')
  })

  it('without files nothing is uploaded', async () => {
    mockCreate()
    const uploaded = mockUploads()
    const { user } = await renderForm()
    await fillValidForm(user)
    await user.click(submitButton())
    await screen.findByRole('heading', { name: 'Ticket 99' })
    expect(uploaded).toEqual([])
  })
})
