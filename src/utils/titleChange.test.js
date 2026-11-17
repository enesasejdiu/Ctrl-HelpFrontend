// titleChange.test.js – how many words a title changed by, which decides when dismissed suggestions come back.
import { changedEnough, changedWords } from './titleChange'

test.each([
  ['printer broken', 'printer broken', 0],
  ['Printer broken', 'printer BROKEN!', 0],
  ['printer broken', 'printer is broken', 1],
  ['printer broken', 'printer is broken again', 2],
  ['printer broken', 'printer brokn', 2],
  ['printer broken', 'vpn does not connect', 6],
  ['', 'vpn down', 2],
])('"%s" → "%s": %i words', (before, after, count) => {
  expect(changedWords(before, after)).toBe(count)
})

test('3 or more changed words count as a different title', () => {
  expect(changedEnough('printer broken', 'printer is broken again')).toBe(false)
  expect(changedEnough('printer broken', 'printer on floor 2 is broken')).toBe(true)
})
