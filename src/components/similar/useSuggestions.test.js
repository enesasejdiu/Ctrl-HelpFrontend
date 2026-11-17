// useSuggestions.test.js – when the suggestions are asked for: 300 ms after typing stops, only from 3 characters,
// the previous request cancelled, an older answer never replacing a newer one, and errors meaning "none".
import { act, renderHook } from '@testing-library/react'
import { getSuggestions } from '../../api/search'
import { DEBOUNCE_MS, useSuggestions } from './useSuggestions'

vi.mock('../../api/search', () => ({ getSuggestions: vi.fn() }))

const RESULTS = {
  tickets: [{ id: 1, number: 1, title: 'Printer', status: 'open', updated_at: '2026-11-10T09:00:00Z' }],
  articles: [],
}

// A promise the test settles by hand, plus the AbortSignal the hook passed with it
function pendingCall() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const render = (title, options) =>
  renderHook(({ value, enabled }) => useSuggestions(value, { enabled }), {
    initialProps: { value: title, enabled: options?.enabled ?? true },
  })

beforeEach(() => {
  vi.useFakeTimers()
  getSuggestions.mockReset()
})
afterEach(() => vi.useRealTimers())

test('asks once, 300 ms after the last change, with the trimmed text', async () => {
  getSuggestions.mockResolvedValue(RESULTS)
  const { rerender, result } = render('pri')
  rerender({ value: 'prin', enabled: true })
  rerender({ value: '  printer  ', enabled: true })
  act(() => vi.advanceTimersByTime(DEBOUNCE_MS - 1))
  expect(getSuggestions).not.toHaveBeenCalled()
  await act(async () => vi.advanceTimersByTime(1))
  expect(getSuggestions).toHaveBeenCalledTimes(1)
  expect(getSuggestions).toHaveBeenCalledWith('printer', { signal: expect.any(AbortSignal) })
  expect(result.current).toEqual({ query: 'printer', results: RESULTS, loading: false })
})

test('below 3 characters, or when turned off, nothing is asked and nothing is returned', async () => {
  const { rerender, result } = render('pr')
  await act(async () => vi.advanceTimersByTime(1000))
  rerender({ value: '   ab   ', enabled: true })
  await act(async () => vi.advanceTimersByTime(1000))
  rerender({ value: 'printer', enabled: false })
  await act(async () => vi.advanceTimersByTime(1000))
  expect(getSuggestions).not.toHaveBeenCalled()
  expect(result.current.results).toBeNull()
})

test('a change while a request runs cancels it, and its late answer is ignored', async () => {
  const first = pendingCall()
  const second = pendingCall()
  getSuggestions.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
  const { rerender, result } = render('printer')
  await act(async () => vi.advanceTimersByTime(DEBOUNCE_MS))
  expect(result.current.loading).toBe(true)
  const firstSignal = getSuggestions.mock.calls[0][1].signal

  rerender({ value: 'printer jam', enabled: true })
  expect(firstSignal.aborted).toBe(true)
  await act(async () => vi.advanceTimersByTime(DEBOUNCE_MS))
  const newer = { tickets: [], articles: [{ slug: 'jams', title: 'Paper jams', summary: '' }] }
  await act(async () => second.resolve(newer))
  // The first answer arrives last: it must not replace the newer one
  await act(async () => first.resolve(RESULTS))
  expect(result.current).toEqual({ query: 'printer jam', results: newer, loading: false })
})

test('previous results stay, marked loading, while the next request runs', async () => {
  const next = pendingCall()
  getSuggestions.mockResolvedValueOnce(RESULTS).mockReturnValueOnce(next.promise)
  const { rerender, result } = render('printer')
  await act(async () => vi.advanceTimersByTime(DEBOUNCE_MS))
  rerender({ value: 'printer offline', enabled: true })
  await act(async () => vi.advanceTimersByTime(DEBOUNCE_MS))
  expect(result.current).toEqual({ query: 'printer', results: RESULTS, loading: true })
})

test('an error (a 429 too) means no suggestions', async () => {
  getSuggestions.mockResolvedValueOnce(RESULTS).mockRejectedValueOnce(Object.assign(new Error('429'), { status: 429 }))
  const { rerender, result } = render('printer')
  await act(async () => vi.advanceTimersByTime(DEBOUNCE_MS))
  expect(result.current.results).toEqual(RESULTS)
  rerender({ value: 'printer offline', enabled: true })
  await act(async () => vi.advanceTimersByTime(DEBOUNCE_MS))
  expect(result.current).toEqual({ query: '', results: null, loading: false })
})

test('leaving the form cancels a running request', async () => {
  const running = pendingCall()
  getSuggestions.mockReturnValueOnce(running.promise)
  const { unmount } = render('printer')
  await act(async () => vi.advanceTimersByTime(DEBOUNCE_MS))
  unmount()
  expect(getSuggestions.mock.calls[0][1].signal.aborted).toBe(true)
})

test('old results are dropped when it turns off, so they never show for a new title', async () => {
  const next = pendingCall()
  getSuggestions.mockResolvedValueOnce(RESULTS).mockReturnValueOnce(next.promise)
  const { rerender, result } = render('printer')
  await act(async () => vi.advanceTimersByTime(DEBOUNCE_MS))
  expect(result.current.results).toEqual(RESULTS)
  rerender({ value: 'pr', enabled: true })
  rerender({ value: 'vpn down', enabled: true })
  expect(result.current.results).toBeNull()
  await act(async () => vi.advanceTimersByTime(DEBOUNCE_MS))
  expect(result.current).toEqual({ query: '', results: null, loading: true })
})
