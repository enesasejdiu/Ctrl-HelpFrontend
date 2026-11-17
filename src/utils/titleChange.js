// titleChange.js – how much a ticket title changed, in words. After "None of these, continue" the suggestions stay
// hidden while the title is still about the same thing: fixing a typo or adding a word doesn't bring them back, writing
// a different title does.

// Words that must differ (added, removed or changed) before the suggestions come back
export const WORDS_BEFORE_SUGGESTING_AGAIN = 3

const words = (text) =>
  new Set(
    String(text ?? '')
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter(Boolean),
  )

// How many words are in one title and not in the other: "printer broken" → "printer is broken again" = 2
export function changedWords(before, after) {
  const a = words(before)
  const b = words(after)
  let count = 0
  for (const word of a) if (!b.has(word)) count += 1
  for (const word of b) if (!a.has(word)) count += 1
  return count
}

export const changedEnough = (before, after) => changedWords(before, after) >= WORDS_BEFORE_SUGGESTING_AGAIN
