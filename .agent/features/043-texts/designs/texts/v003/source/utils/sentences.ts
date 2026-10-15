import type { SentencePair, Side } from '../types/texts'

export interface Segment {
  text: string
  trailing: string
}

const END = /[.!?…]/
const CLOSERS = /[.!?…"'”’»)\]]/
const SPACE = /\s/

/** Splits text into sentences while keeping the exact whitespace between them. */
export function splitSentences(input: string): Segment[] {
  const segments: Segment[] = []
  const n = input.length
  let i = 0
  while (i < n && SPACE.test(input[i])) i++
  let start = i
  while (i < n) {
    const ch = input[i]
    if (END.test(ch)) {
      let j = i + 1
      while (j < n && CLOSERS.test(input[j])) j++
      if (j >= n || SPACE.test(input[j])) {
        let k = j
        while (k < n && SPACE.test(input[k])) k++
        segments.push({ text: input.slice(start, j), trailing: input.slice(j, k) })
        i = k
        start = k
        continue
      }
      i = j
      continue
    }
    if (ch === '\n') {
      let end = i
      while (end > start && SPACE.test(input[end - 1])) end--
      let k = i
      while (k < n && SPACE.test(input[k])) k++
      if (end > start) segments.push({ text: input.slice(start, end), trailing: input.slice(end, k) })
      i = k
      start = k
      continue
    }
    i++
  }
  if (start < n) {
    let end = n
    while (end > start && SPACE.test(input[end - 1])) end--
    if (end > start) segments.push({ text: input.slice(start, end), trailing: input.slice(end) })
  }
  return segments
}

export function textFromPairs(pairs: SentencePair[], side: Side): string {
  return pairs.map((p) => (side === 'source' ? p.source : p.target) + p.trailing).join('').trimEnd()
}

export function groupParagraphs(pairs: SentencePair[]): SentencePair[][] {
  const paragraphs: SentencePair[][] = []
  let current: SentencePair[] = []
  pairs.forEach((p) => {
    current.push(p)
    if (p.trailing.includes('\n')) {
      paragraphs.push(current)
      current = []
    }
  })
  if (current.length) paragraphs.push(current)
  return paragraphs
}

export function firstLine(text: string): string {
  const line = text.split('\n').find((l) => l.trim().length > 0) ?? ''
  const trimmed = line.trim()
  return trimmed.length > 80 ? `${trimmed.slice(0, 77).trimEnd()}…` : trimmed
}

export function formatCount(n: number): string {
  return n.toLocaleString('en-US')
}
