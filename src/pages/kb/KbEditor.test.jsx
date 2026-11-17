// KbEditor.test.jsx – /kb/new and /kb/:slug/edit (staff): checks under each field, saving and publishing, the
// preview and toolbar, the address (slug) rules, the "someone else changed it" dialog, the unsaved-changes warning, the
// local copy after a crash, and deleting (admins).
import { screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { useParams } from 'react-router'
import { buildArticle, buildCategory, mockKb } from '../../test/kbBackend'
import { buildUser } from '../../test/factories'
import { renderWithProviders } from '../../test/render'
import { API, server } from '../../test/server'
import { DRAFT_BACKUP_PREFIX } from './draftBackup'
import KbEditor from './KbEditor'

const agent = buildUser({ id: 7, role: 'agent' })
const admin = buildUser({ id: 1, role: 'admin' })
const email = buildCategory({ id: 1, name: 'Email' })

function ArticleStub() {
  const { slug } = useParams()
  return <h1>Article {slug}</h1>
}

const render = (route, user = agent) =>
  renderWithProviders(null, {
    route,
    user,
    routes: [
      { path: '/kb/new', element: <KbEditor /> },
      { path: '/kb/:slug/edit', element: <KbEditor /> },
      { path: '/kb/:slug', element: <ArticleStub /> },
      { path: '/kb/manage', element: <h1>Manage page</h1> },
    ],
  })

const field = (name) => screen.getByLabelText(name, { selector: 'input, textarea, select' })

beforeEach(() => window.localStorage.clear())

describe('a new article', () => {
  test('checks every field before saving, under each field, and sends nothing', async () => {
    const state = mockKb({ categories: [email] })
    const { user } = await render('/kb/new')
    await user.type(await screen.findByLabelText('Title'), 'Four')
    await user.click(screen.getByRole('button', { name: 'Save draft' }))
    expect(screen.getByText('Please fix the fields marked below.')).toBeInTheDocument()
    expect(field('Title')).toHaveAccessibleDescription('Title must be at least 5 characters')
    expect(field('Title')).toHaveAttribute('aria-invalid', 'true')
    expect(field('Category')).toHaveAccessibleDescription('Choose a category')
    expect(field('Article')).toHaveAccessibleDescription(expect.stringContaining('The article needs some text'))
    expect(state.saves).toEqual([])
  })

  test('Save draft creates it as a draft and moves to its own editor address', async () => {
    const state = mockKb({ categories: [email] })
    const { user, router } = await render('/kb/new')
    await user.type(await screen.findByLabelText('Title'), 'Reset your password')
    await user.selectOptions(field('Category'), 'Email')
    await user.type(field('Summary'), 'Steps for a new password')
    await user.type(field('Article'), 'Open the profile.')
    expect(screen.getByText('24 / 300')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Save draft' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/kb/reset-your-password/edit'))
    expect(state.saves).toEqual([
      {
        method: 'POST',
        body: {
          title: 'Reset your password',
          summary: 'Steps for a new password',
          body: 'Open the profile.',
          category_id: 1,
          status: 'draft',
        },
      },
    ])
    expect(router.state.location.state).toEqual({ flash: 'Saved.' })
  })

  test('Publish creates it published and opens the article', async () => {
    const state = mockKb({ categories: [email] })
    const { user, router } = await render('/kb/new')
    await user.type(await screen.findByLabelText('Title'), 'Printer is offline')
    await user.selectOptions(field('Category'), 'Email')
    await user.type(field('Article'), 'Turn it off and on.')
    await user.click(screen.getByRole('button', { name: 'Publish' }))
    expect(await screen.findByRole('heading', { name: 'Article printer-is-offline' })).toBeInTheDocument()
    expect(state.saves[0].body.status).toBe('published')
    expect(router.state.location.state).toEqual({ flash: 'Article published.' })
  })

  test('the address is made from the title when it is first saved', async () => {
    mockKb({ categories: [email] })
    await render('/kb/new')
    expect(await screen.findByText('Made from the title when you first save.')).toBeInTheDocument()
  })

  test('no categories yet: says so, with a link to add one', async () => {
    mockKb({ categories: [] })
    await render('/kb/new')
    expect(await screen.findByText('There are no categories yet.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Add one on the Manage page' })).toHaveAttribute('href', '/kb/manage')
  })
})

describe('the preview and the toolbar', () => {
  test('the preview shows the formatted text, with anything unsafe removed', async () => {
    mockKb({ categories: [email] })
    const { user } = await render('/kb/new')
    const preview = await screen.findByRole('region', { name: 'Preview' })
    expect(within(preview).getByText('Nothing to preview yet.')).toBeInTheDocument()
    await user.type(field('Article'), '## Steps{enter}{enter}**Bold** <img src=x onerror=alert(1)>')
    expect(within(preview).getByRole('heading', { level: 2, name: 'Steps' })).toBeInTheDocument()
    expect(within(preview).getByText('Bold').tagName).toBe('STRONG')
    expect(preview.querySelector('img')).toBeNull()
  })

  test('Bold wraps the selected words, and the result stays selected', async () => {
    mockKb({ categories: [email] })
    const { user } = await render('/kb/new')
    const body = await screen.findByLabelText('Article', { selector: 'textarea' })
    await user.type(body, 'make this strong')
    body.setSelectionRange(5, 9)
    await user.click(screen.getByRole('button', { name: 'Bold' }))
    expect(body).toHaveValue('make **this** strong')
    await waitFor(() => expect([body.selectionStart, body.selectionEnd]).toEqual([7, 11]))
  })

  test('narrow screens switch between Write and Preview', async () => {
    mockKb({ categories: [email] })
    const { user } = await render('/kb/new')
    const write = await screen.findByRole('button', { name: 'Write' })
    expect(write).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: 'Preview' }))
    expect(screen.getByRole('button', { name: 'Preview' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('region', { name: 'Preview' })).not.toHaveClass('is-inactive')
  })
})

describe('an existing article', () => {
  test('a draft never published: the address can be edited, and only changed fields are sent', async () => {
    const draft = buildArticle({ id: 5, title: 'Draft article', category: email, status: 'draft', summary: 'Old' })
    const state = mockKb({ categories: [email], articles: [draft] })
    const { user } = await render('/kb/draft-article/edit')
    const slug = await screen.findByLabelText('Address')
    expect(slug).toHaveValue('draft-article')
    await user.clear(slug)
    await user.type(slug, 'better-address')
    await user.clear(field('Summary'))
    await user.click(screen.getByRole('button', { name: 'Save draft' }))
    await waitFor(() => expect(state.saves).toHaveLength(1))
    expect(state.saves[0].body).toEqual({ updated_at: draft.updated_at, summary: '', slug: 'better-address' })
  })

  test('published: the address is fixed and explained; Save changes and Unpublish', async () => {
    const live = buildArticle({ id: 6, title: 'Live article', category: email })
    const state = mockKb({ categories: [email], articles: [live] })
    const { user } = await render('/kb/live-article/edit')
    expect(
      await screen.findByText('Fixed since it was first published, so links to it keep working.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Address' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Unpublish' }))
    expect(await screen.findByText('Article moved back to drafts.')).toBeInTheDocument()
    expect(state.saves[0].body).toEqual({ updated_at: live.updated_at, status: 'draft' })
    expect(screen.getByRole('button', { name: 'Publish' })).toBeInTheDocument()
  })

  test("the server's field messages land under the field (here: an address in use)", async () => {
    mockKb({
      categories: [email],
      articles: [buildArticle({ id: 5, title: 'Draft article', category: email, status: 'draft' })],
    })
    server.use(
      http.patch(`${API}/kb/articles/:id`, () =>
        HttpResponse.json(
          {
            message: 'Another article already uses this address',
            code: 'SLUG_TAKEN',
            errors: [{ field: 'slug', message: 'Another article already uses this address' }],
          },
          { status: 409 },
        ),
      ),
    )
    const { user } = await render('/kb/draft-article/edit')
    const slug = await screen.findByLabelText('Address')
    await user.clear(slug)
    await user.type(slug, 'taken')
    await user.click(screen.getByRole('button', { name: 'Save draft' }))
    await waitFor(() =>
      expect(slug).toHaveAccessibleDescription(expect.stringContaining('Another article already uses this address')),
    )
  })

  test('an unknown article shows "not found"', async () => {
    mockKb({ categories: [email] })
    await render('/kb/nope/edit')
    expect(await screen.findByText("This article doesn't exist or has been removed.")).toBeInTheDocument()
  })
})

describe('someone else saved in between', () => {
  test('a dialog; "Reload their version" copies your text and loads theirs', async () => {
    const article = buildArticle({ id: 5, title: 'Shared article', category: email, status: 'draft', body: 'Original' })
    const state = mockKb({ categories: [email], articles: [article] })
    const { user } = await render('/kb/shared-article/edit')
    const body = await screen.findByLabelText('Article', { selector: 'textarea' })
    await user.clear(body)
    await user.type(body, 'My version')
    // Meanwhile another editor saves
    Object.assign(state.articles[0], { body: 'Their version', updated_at: '2026-11-11T10:00:00.000Z' })

    await user.click(screen.getByRole('button', { name: 'Save draft' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Someone else changed this article' })
    expect(dialog).toHaveTextContent('your changes are copied to the clipboard')
    await user.click(within(dialog).getByRole('button', { name: 'Reload their version' }))
    await waitFor(() => expect(body).toHaveValue('Their version'))
    expect(await navigator.clipboard.readText()).toBe('My version')
    expect(screen.getByText('Their version is loaded. Your text is on the clipboard.')).toBeInTheDocument()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  test('Cancel keeps your version on screen', async () => {
    const article = buildArticle({ id: 5, title: 'Shared article', category: email, status: 'draft', body: 'Original' })
    const state = mockKb({ categories: [email], articles: [article] })
    const { user } = await render('/kb/shared-article/edit')
    const body = await screen.findByLabelText('Article', { selector: 'textarea' })
    await user.type(body, ' and more')
    state.articles[0].updated_at = '2026-11-11T10:00:00.000Z'
    await user.click(screen.getByRole('button', { name: 'Save draft' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Someone else changed this article' })
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(body).toHaveValue('Original and more')
  })
})

describe('unsaved changes', () => {
  test('leaving asks first; "Keep editing" stays, "Leave" goes', async () => {
    mockKb({ categories: [email] })
    const { user, router } = await render('/kb/new')
    await user.type(await screen.findByLabelText('Title'), 'Half written')
    await user.click(screen.getByRole('link', { name: 'Cancel' }))
    const ask = screen.getByRole('alertdialog', { name: 'Leave without saving?' })
    await user.click(within(ask).getByRole('button', { name: 'Keep editing' }))
    expect(router.state.location.pathname).toBe('/kb/new')
    expect(field('Title')).toHaveValue('Half written')

    await user.click(screen.getByRole('link', { name: 'Cancel' }))
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Leave' }))
    expect(await screen.findByRole('heading', { name: 'Manage page' })).toBeInTheDocument()
  })

  test('nothing changed: leaving does not ask', async () => {
    mockKb({ categories: [email] })
    const { user } = await render('/kb/new')
    await screen.findByLabelText('Title')
    await user.click(screen.getByRole('link', { name: 'Cancel' }))
    expect(await screen.findByRole('heading', { name: 'Manage page' })).toBeInTheDocument()
  })

  test('closing the tab with changes asks the browser to warn', async () => {
    mockKb({ categories: [email] })
    const { user } = await render('/kb/new')
    await user.type(await screen.findByLabelText('Title'), 'Unsaved')
    const event = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
  })

  test('a copy kept in the browser is offered back, and Restore puts it in the form', async () => {
    const article = buildArticle({
      id: 5,
      title: 'Crashed article',
      category: email,
      status: 'draft',
      body: 'Saved text',
    })
    mockKb({ categories: [email], articles: [article] })
    window.localStorage.setItem(
      `${DRAFT_BACKUP_PREFIX}5`,
      JSON.stringify({
        form: {
          title: 'Crashed article',
          slug: 'crashed-article',
          summary: '',
          body: 'Text I typed',
          category_id: '1',
        },
        at: Date.parse('2026-11-12T10:00:00Z'),
        updated_at: article.updated_at,
      }),
    )
    const { user } = await render('/kb/crashed-article/edit')
    expect(await screen.findByText(/You have unsaved changes from/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Restore them' }))
    expect(field('Article')).toHaveValue('Text I typed')
    expect(screen.queryByText(/You have unsaved changes from/)).not.toBeInTheDocument()
  })

  test('typing keeps a copy in the browser; saving removes it', async () => {
    mockKb({
      categories: [email],
      articles: [buildArticle({ id: 5, title: 'Typed article', category: email, status: 'draft' })],
    })
    const { user } = await render('/kb/typed-article/edit')
    await user.type(await screen.findByLabelText('Article', { selector: 'textarea' }), ' more')
    await waitFor(() => expect(window.localStorage.getItem(`${DRAFT_BACKUP_PREFIX}5`)).toContain(' more'))
    await user.click(screen.getByRole('button', { name: 'Save draft' }))
    await waitFor(() => expect(window.localStorage.getItem(`${DRAFT_BACKUP_PREFIX}5`)).toBeNull())
  })
})

describe('deleting', () => {
  test('admins delete after confirming, and land on Manage', async () => {
    const state = mockKb({
      categories: [email],
      articles: [buildArticle({ id: 5, title: 'Old article', category: email })],
    })
    const { user, router } = await render('/kb/old-article/edit', admin)
    await user.click(await screen.findByRole('button', { name: 'Delete' }))
    const confirm = screen.getByRole('alertdialog', { name: 'Delete article' })
    expect(confirm).toHaveTextContent('Delete “Old article”?')
    await user.click(within(confirm).getByRole('button', { name: 'Delete' }))
    expect(await screen.findByRole('heading', { name: 'Manage page' })).toBeInTheDocument()
    expect(state.deletes).toEqual([5])
    expect(router.state.location.state).toEqual({ flash: 'Article deleted.' })
  })

  test('agents get no Delete', async () => {
    mockKb({ categories: [email], articles: [buildArticle({ id: 5, title: 'Old article', category: email })] })
    await render('/kb/old-article/edit')
    await screen.findByLabelText('Title')
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
  })
})
