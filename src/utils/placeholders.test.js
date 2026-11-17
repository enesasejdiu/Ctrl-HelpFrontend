// placeholders.test.js – filling {{…}} from the open ticket: every known placeholder, unknown ones left as written (and
// listed), spaces inside the braces, and the result staying plain text.
import { PLACEHOLDERS, fillPlaceholders, placeholderParts, placeholderValues } from './placeholders'

const values = placeholderValues({
  ticket: { id: 42, title: 'Printer broken', requester_name: '  Liridon Gashi ' },
  user: { name: 'Arben Krasniqi' },
  companyName: 'Acme',
})

test('every documented placeholder has a value', () => {
  expect(PLACEHOLDERS.map((p) => p.key)).toEqual(Object.keys(values))
  expect(values).toEqual({
    'requester.name': 'Liridon Gashi',
    'requester.first_name': 'Liridon',
    'agent.name': 'Arben Krasniqi',
    'ticket.number': '42',
    'ticket.title': 'Printer broken',
    'company.name': 'Acme',
  })
})

test('fills each placeholder, also with spaces inside the braces', () => {
  expect(
    fillPlaceholders(
      'Hi {{requester.first_name}}, #{{ ticket.number }} "{{ticket.title}}" – {{agent.name}}, {{company.name}}',
      values,
    ),
  ).toEqual({ text: 'Hi Liridon, #42 "Printer broken" – Arben Krasniqi, Acme', unknown: [] })
})

test('unknown placeholders stay as written and are listed once', () => {
  expect(fillPlaceholders('{{who}} and {{who}} and {{requester.age}}', values)).toEqual({
    text: '{{who}} and {{who}} and {{requester.age}}',
    unknown: ['{{who}}', '{{requester.age}}'],
  })
})

test('a known placeholder without a value (no requester name) also stays, as unknown', () => {
  const empty = placeholderValues({ ticket: { id: 1, title: 'T', requester_name: null }, user: null, companyName: '' })
  expect(fillPlaceholders('Hi {{requester.name}}', empty)).toEqual({
    text: 'Hi {{requester.name}}',
    unknown: ['{{requester.name}}'],
  })
})

test('the parts say which text was filled in, for the preview', () => {
  expect(placeholderParts('Hi {{requester.first_name}} {{x}}!', values)).toEqual([
    { text: 'Hi ', kind: 'text' },
    { text: 'Liridon', kind: 'filled' },
    { text: ' ', kind: 'text' },
    { text: '{{x}}', kind: 'unknown' },
    { text: '!', kind: 'text' },
  ])
})

test('values are text: markup in a name is never interpreted here', () => {
  const tricky = placeholderValues({ ticket: { id: 1, title: '<b>x</b>', requester_name: '<img src=x>' }, user: null })
  expect(fillPlaceholders('{{requester.name}} {{ticket.title}}', tricky).text).toBe('<img src=x> <b>x</b>')
})
