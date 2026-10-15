import type { SelectionInfo, Side } from '../types/texts'

function sentenceOf(node: Node): HTMLElement | null {
  const el = node.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : node.parentElement
  return el?.closest<HTMLElement>('[data-sent]') ?? null
}

/**
 * Reads the native selection inside `container` and validates it:
 * one actual sentence, at most 200 characters, keeping the exact occurrence offset.
 */
export function analyzeSelection(container: HTMLElement | null): SelectionInfo | null {
  const sel = window.getSelection()
  if (!container || !sel || sel.rangeCount === 0 || sel.isCollapsed) return null
  const range = sel.getRangeAt(0)
  if (!container.contains(range.commonAncestorContainer)) return null
  const raw = sel.toString()
  const text = raw.trim()
  if (!text) return null
  const r = range.getBoundingClientRect()
  const rect = { top: r.top, left: r.left, width: r.width, height: r.height }

  const startEl = sentenceOf(range.startContainer)
  const endEl = sentenceOf(range.endContainer)
  const el = startEl ?? endEl
  if (!el || (startEl && endEl && startEl !== endEl)) return { kind: 'cross', text, rect }
  const sentence = el.textContent ?? ''
  if ((!startEl || !endEl) && !sentence.includes(text)) return { kind: 'cross', text, rect }
  if (text.length > 200) return { kind: 'long', text, rect }

  let start: number
  if (startEl) {
    const pre = document.createRange()
    pre.selectNodeContents(startEl)
    pre.setEnd(range.startContainer, range.startOffset)
    start = pre.toString().length + (raw.length - raw.trimStart().length)
  } else {
    start = sentence.indexOf(text)
  }
  const [pairId, side, idx] = (el.dataset.sent ?? '').split('|')
  return {
    kind: 'valid',
    text,
    rect,
    pairId,
    side: side as Side,
    sentenceIndex: Number(idx),
    start,
    end: start + text.length,
    sentence,
  }
}
