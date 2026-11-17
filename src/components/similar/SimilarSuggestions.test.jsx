// SimilarSuggestions.test.jsx – the "Is this the same problem?" panel on the real New ticket form (MSW backend): what
// it shows, links that open in a new tab, the marked words, the live region, hiding on no results or errors,
// "None of these, continue", and that it never gets in the way of submitting.
import { screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import NewTicket from '../../pages/NewTicket'
import { buildUser } from '../../test/factories'
import { renderWithProviders } from '../../test/render'
import { API, deferred, server } from '../../test/server'

const DAY = 24 * 60 * 60 * 1000
const TICKET = { id: 42, number: 42, title: 'Printer not printing on floor 2', status: 'in_progress' }
const ARTICLE = {
  slug: 'printer-not-printing',
  title: 'Printer not printing',
  summary: 'Check the printer queue first.',
}

// Answers GET /search/suggestions with `answer(q)` and records every q
function mockSuggestions(answer = () => HttpResponse.json({ tickets: [], articles: [] })) {
  const asked = []
  server.use(
    http.get(`${API}/search/suggestions`, ({ request }) => {
      const q = new URL(request.url).searchParams.get('q')
      asked.push(q)
      return answer(q)
    }),
  )
  return asked
}

const found = () =>
  HttpResponse.json({
    tickets: [{ ...TICKET, updated_at: new Date(Date.now() - 2 * DAY).toISOString() }],
    articles: [ARTICLE],
  })

async function renderForm() {
  const result = await renderWithProviders(<NewTicket />, { route: '/tickets/new', user: buildUser() })
  await screen.findByRole('combobox', { name: 'Category' })
  return result
}

const titleField = () => screen.getByRole('textbox', { name: 'Title' })
const panel = () => screen.findByRole('region', { name: 'Is this the same problem?' })
const liveRegion = () => document.querySelector('p[aria-live]')

test('similar open tickets and help articles, as lists, with the words marked', async () => {
  mockSuggestions(found)
  const { user } = await renderForm()
  await user.type(titleField(), 'printer not working')

  const region = await panel()
  const tickets = within(region).getByRole('list', { name: 'Similar open tickets' })
  const ticket = within(tickets).getByRole('link')
  expect(ticket).toHaveAccessibleName(
    '#42 Printer not printing on floor 2 In Progress updated 2 days ago (opens in a new tab)',
  )
  expect(ticket).toHaveAttribute('href', '/tickets/42')

  const articles = within(region).getByRole('list', { name: 'Help articles' })
  const article = within(articles).getByRole('link')
  expect(article).toHaveAttribute('href', '/kb/printer-not-printing')
  expect(article).toHaveTextContent('Check the printer queue first.')

  // "printer" and "not" from the title are marked (words of 3+ letters); "working" is in neither
  expect([...region.querySelectorAll('mark')].map((mark) => mark.textContent)).toEqual([
    'Printer',
    'not',
    'Printer',
    'not',
    'printer',
  ])
})

test('every link opens in a new tab, safely', async () => {
  mockSuggestions(found)
  const { user } = await renderForm()
  await user.type(titleField(), 'printer')
  for (const link of within(await panel()).getAllByRole('link')) {
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  }
})

test('text from the server is shown as text, never as HTML', async () => {
  mockSuggestions(() =>
    HttpResponse.json({
      tickets: [],
      articles: [{ slug: 'x', title: '<img src=x onerror=alert(1)> printer', summary: '' }],
    }),
  )
  const { user, container } = await renderForm()
  await user.type(titleField(), 'printer')
  expect(await within(await panel()).findByText(/<img src=x onerror=alert\(1\)>/)).toBeInTheDocument()
  expect(container.querySelector('.suggest img')).toBeNull()
})

test('a polite live region says how many were found', async () => {
  mockSuggestions(found)
  const { user } = await renderForm()
  expect(liveRegion()).toHaveTextContent('')
  await user.type(titleField(), 'printer')
  await panel()
  expect(liveRegion()).toHaveTextContent('2 similar items found')
  expect(liveRegion()).toHaveAttribute('aria-live', 'polite')
})

test('no results: no panel at all, and nothing announced', async () => {
  const asked = mockSuggestions()
  const { user } = await renderForm()
  await user.type(titleField(), 'something unusual')
  await waitFor(() => expect(asked).toContain('something unusual'))
  expect(screen.queryByRole('region', { name: 'Is this the same problem?' })).not.toBeInTheDocument()
  expect(liveRegion()).toHaveTextContent('')
})

test.each([
  ['a server error', 500],
  ['too many requests (429)', 429],
])('%s hides the panel quietly, with no error on the form', async (_, status) => {
  let fail = false
  const asked = mockSuggestions((q) => (fail ? HttpResponse.json({ message: 'No' }, { status }) : found(q)))
  const { user } = await renderForm()
  await user.type(titleField(), 'printer')
  await panel()
  fail = true
  await user.type(titleField(), ' offline')
  await waitFor(() => expect(asked.at(-1)).toBe('printer offline'))
  await waitFor(() =>
    expect(screen.queryByRole('region', { name: 'Is this the same problem?' })).not.toBeInTheDocument(),
  )
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

test('fewer than 3 characters: nothing is asked', async () => {
  const asked = mockSuggestions(found)
  const { user } = await renderForm()
  await user.type(titleField(), 'pr ')
  // Give a request time to go out if one were going to (the wait is 300 ms)
  await new Promise((resolve) => setTimeout(resolve, 400))
  expect(asked).toEqual([])
})

test('"None of these, continue" hides it; small edits keep it hidden; a different title brings it back', async () => {
  const asked = mockSuggestions(found)
  const { user } = await renderForm()
  await user.type(titleField(), 'printer broken')
  await user.click(within(await panel()).getByRole('button', { name: 'None of these, continue' }))
  expect(screen.queryByRole('region', { name: 'Is this the same problem?' })).not.toBeInTheDocument()
  const askedBefore = asked.length

  // Two words more: still the same problem, so nothing is asked and nothing shows
  await user.type(titleField(), ' again today')
  await new Promise((resolve) => setTimeout(resolve, 400))
  expect(asked).toHaveLength(askedBefore)
  expect(screen.queryByRole('region', { name: 'Is this the same problem?' })).not.toBeInTheDocument()

  // A different title
  await user.clear(titleField())
  await user.type(titleField(), 'cannot open shared mailbox')
  expect(await panel()).toBeInTheDocument()
  expect(asked.at(-1)).toBe('cannot open shared mailbox')
})

test('it never blocks submitting: the ticket is sent while suggestions are still loading', async () => {
  const pending = deferred()
  mockSuggestions(async () => {
    await pending.promise
    return found()
  })
  const created = []
  server.use(
    http.post(`${API}/tickets`, async ({ request }) => {
      created.push(await request.json())
      return HttpResponse.json({ id: 99 }, { status: 201 })
    }),
  )
  const { user, router } = await renderForm()
  await user.type(titleField(), 'Printer jammed')
  await user.selectOptions(screen.getByRole('combobox', { name: 'Category' }), 'Hardware')
  await user.type(screen.getByRole('textbox', { name: 'Description' }), 'Paper stuck in tray 2.')
  await user.click(screen.getByRole('button', { name: /submit/i }))
  await waitFor(() => expect(router.state.location.pathname).toBe('/tickets/99'))
  expect(created[0].title).toBe('Printer jammed')
  pending.resolve()
})
