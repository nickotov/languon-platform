import type { ComparisonResult, IgnoredDifference } from '../types/practice'

interface Options {
  unicode: boolean
  apostrophes: boolean
  case: boolean
  punctuation: boolean
  spaces: boolean
}

const ALL: Options = { unicode: true, apostrophes: true, case: true, punctuation: true, spaces: true }

/**
 * Conservative normalization for a free comparison with ONE saved reference.
 * Accents, letters and word order stay significant. Punctuation becomes a
 * boundary (never merges separated words). Used only for comparison — the
 * displayed draft and reference are never altered.
 */
function normalize(value: string, options: Options): string {
  let text = value
  if (options.unicode) text = text.normalize('NFC')
  if (options.apostrophes) text = text.replace(/[’‘ʼ`´]/g, "'")
  if (options.case) text = text.toLocaleLowerCase()
  if (options.punctuation) {
    text = text
      // Apostrophes inside a word keep the word together (j'arrive), elsewhere they're punctuation.
      .replace(/(?<!\p{L})'|'(?!\p{L})/gu, ' ')
      .replace(/[^\p{L}\p{N}\p{M}'\s]/gu, ' ')
  }
  if (options.spaces) text = text.replace(/\s+/g, ' ').trim()
  return text
}

export function compareWithReference(draft: string, reference: string): ComparisonResult {
  if (draft.trim().length === 0) return { kind: 'reference-only', draft, reference, ignored: [] }
  const matches = normalize(draft, ALL) === normalize(reference, ALL)
  if (!matches) return { kind: 'different', draft, reference, ignored: [] }

  const ignored = (['unicode', 'apostrophes', 'case', 'punctuation', 'spaces'] as IgnoredDifference[]).filter(
    (key) => {
      const without = { ...ALL, [key]: false }
      // Spaces only matter once punctuation has turned into gaps, so test it with raw whitespace.
      return normalize(draft, without) !== normalize(reference, without)
    },
  )
  return { kind: 'match', draft, reference, ignored }
}

export const ignoredLabels: Record<IgnoredDifference, string> = {
  case: 'capital letters',
  spaces: 'extra spaces',
  punctuation: 'punctuation',
  apostrophes: 'apostrophe style (’ and \')',
  unicode: 'equivalent Unicode spelling',
}

