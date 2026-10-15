import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { PencilLineIcon } from 'lucide-react'
import { Tabs } from '../Tabs'
import { CounterpartSheet } from './CounterpartSheet'
import { SentenceText } from './SentenceText'
import { languageName } from '../../utils/languages'
import { analyzeSelection } from '../../utils/selection'
import { groupParagraphs, splitSentences } from '../../utils/sentences'
import type { LanguageCode, SelectionInfo, SentencePair, Side, TextMark } from '../../types/texts'

interface ReadingViewProps {
  pairs: SentencePair[]
  sourceLang: LanguageCode
  targetLang: LanguageCode
  matchMode: boolean
  compact: boolean
  marks?: TextMark[]
  showEditedMarkers?: boolean
  onSelection?: (info: SelectionInfo | null) => void
  /** Rendered above the text inside the scroll area (banners). */
  topSlot?: React.ReactNode
  /** Controlled phone tab, so the parent can switch to Translation after translating. */
  tab?: Side
  onTabChange?: (tab: Side) => void
  /** Replaces the translation column (e.g. before translating). */
  translationOverride?: React.ReactNode
}

export function ReadingView({
  pairs,
  sourceLang,
  targetLang,
  matchMode,
  compact,
  marks = [],
  showEditedMarkers = true,
  onSelection,
  topSlot,
  tab: tabProp,
  onTabChange,
  translationOverride,
}: ReadingViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const [innerTab, setInnerTab] = useState<Side>('source')
  const tab = tabProp ?? innerTab
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [focusId, setFocusId] = useState<string | null>(null)
  const [announce, setAnnounce] = useState('')
  const [sheetIndex, setSheetIndex] = useState<number | null>(null)
  const pendingAnchor = useRef<string | null>(null)

  const paragraphs = useMemo(() => groupParagraphs(pairs), [pairs])
  const targetSegments = useMemo(() => {
    const map: Record<string, ReturnType<typeof splitSentences>> = {}
    pairs.forEach((p) => (map[p.id] = splitSentences(p.target)))
    return map
  }, [pairs])
  const activeId = matchMode ? focusId ?? hoverId : null

  useEffect(() => {
    if (!matchMode) {
      setHoverId(null)
      setFocusId(null)
      setSheetIndex(null)
    }
  }, [matchMode])

  // Native selection → validated selection info (debounced so touch handles can settle).
  useEffect(() => {
    if (!onSelection) return
    let t = 0
    const handle = () => {
      window.clearTimeout(t)
      t = window.setTimeout(() => onSelection(analyzeSelection(contentRef.current)), 220)
    }
    document.addEventListener('selectionchange', handle)
    return () => {
      document.removeEventListener('selectionchange', handle)
      window.clearTimeout(t)
    }
  }, [onSelection])

  const setTab = (next: Side) => {
    const container = scrollRef.current
    if (container) {
      const limit = container.getBoundingClientRect().top + 72
      const els = Array.from(container.querySelectorAll<HTMLElement>(`[data-pair][data-side="${tab}"]`))
      const first = els.find((el) => el.getBoundingClientRect().bottom > limit)
      pendingAnchor.current = first?.dataset.pair ?? null
    }
    if (onTabChange) onTabChange(next)
    else setInnerTab(next)
  }

  // Preserve reading position across Source/Translation tabs.
  useLayoutEffect(() => {
    const id = pendingAnchor.current
    const container = scrollRef.current
    if (!id || !container) return
    pendingAnchor.current = null
    const el = container.querySelector<HTMLElement>(`[data-pair="${id}"][data-side="${tab}"]`)
    if (el) el.scrollIntoView({ block: 'start' })
  }, [tab])

  const marksFor = (pairId: string, side: Side, idx: number) =>
    marks.filter((m) => m.pairId === pairId && m.side === side && m.sentenceIndex === idx)

  const counterpartText = (pair: SentencePair, side: Side) => (side === 'source' ? pair.target : pair.source)

  const handleTap = (index: number) => {
    if (!matchMode || !compact) return
    const sel = window.getSelection()
    if (sel && !sel.isCollapsed) return
    setSheetIndex(index)
  }

  const renderPair = (pair: SentencePair, side: Side) => {
    const index = pairs.findIndex((p) => p.id === pair.id)
    const segs = side === 'source' ? [{ text: pair.source, trailing: '' }] : targetSegments[pair.id] ?? []
    const active = activeId === pair.id
    const cls = [
      'scroll-mt-24 rounded-sm transition-colors box-decoration-clone',
      matchMode ? 'cursor-pointer underline underline-offset-4' : '',
      matchMode && !active ? 'decoration-dotted decoration-border-strong' : '',
      active ? 'bg-primary-subtle decoration-solid decoration-primary-default decoration-2' : '',
      'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus',
    ].join(' ')
    return (
      <React.Fragment key={`${pair.id}-${side}`}>
        <span
          data-pair={pair.id}
          data-side={side}
          className={cls}
          tabIndex={matchMode ? 0 : undefined}
          onMouseEnter={matchMode ? () => setHoverId(pair.id) : undefined}
          onMouseLeave={matchMode ? () => setHoverId((h) => (h === pair.id ? null : h)) : undefined}
          onFocus={
            matchMode
              ? () => {
                  setFocusId(pair.id)
                  setAnnounce(`Matched ${side === 'source' ? 'translation' : 'source'}: ${counterpartText(pair, side)}`)
                }
              : undefined
          }
          onBlur={matchMode ? () => setFocusId((f) => (f === pair.id ? null : f)) : undefined}
          onClick={() => handleTap(index)}
          onKeyDown={(e) => {
            if (matchMode && compact && (e.key === 'Enter' || e.key === ' ')) {
              e.preventDefault()
              setSheetIndex(index)
            }
          }}
        >
          {segs.map((s, i) => (
            <React.Fragment key={i}>
              <span data-sent={`${pair.id}|${side}|${i}`}>
                <SentenceText text={s.text} marks={marksFor(pair.id, side, i)} />
              </span>
              {i < segs.length - 1 ? s.trailing || ' ' : null}
            </React.Fragment>
          ))}
        </span>
        {side === 'target' && showEditedMarkers && pair.edited && (
          <span className="ml-1 inline-flex items-center align-middle text-warning-default" title="Edited after translation">
            <PencilLineIcon className="h-3.5 w-3.5" aria-hidden />
            <span className="sr-only">(edited after translation)</span>
          </span>
        )}
        {pair.trailing.includes('\n') ? null : pair.trailing}
      </React.Fragment>
    )
  }

  const textCls = 'reading-measure whitespace-pre-wrap break-words text-base leading-8 text-text-primary sm:text-lg sm:leading-9'
  const showSource = !compact || tab === 'source'
  const showTarget = !compact || tab === 'target'

  return (
    <div ref={scrollRef} className="relative h-full overflow-y-auto overscroll-contain">
      {compact ? (
        <div className="sticky top-0 z-10 border-b border-border-default bg-background-canvas px-3 py-2">
          <Tabs
            variant="segmented"
            size="sm"
            fullWidth
            aria-label="Choose text to read"
            value={tab}
            onValueChange={(v) => setTab(v as Side)}
            items={[
              { value: 'source', label: <span className="truncate">Source · {languageName(sourceLang)}</span> },
              { value: 'target', label: <span className="truncate">Translation · {languageName(targetLang)}</span> },
            ]}
          />
        </div>
      ) : (
        <div className="sticky top-0 z-10 border-b border-border-default bg-background-canvas">
          <div className="mx-auto grid max-w-6xl grid-cols-2 gap-12 px-8 py-3 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
            <span>Source · <span className="text-text-secondary">{languageName(sourceLang)}</span></span>
            <span>Translation · <span className="text-text-secondary">{languageName(targetLang)}</span></span>
          </div>
        </div>
      )}

      {topSlot && <div className="mx-auto max-w-6xl px-4 pt-4 sm:px-6 lg:px-8">{topSlot}</div>}

      <div ref={contentRef} className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        {translationOverride && compact && tab === 'target' ? (
          translationOverride
        ) : (
          <div className={!compact && translationOverride ? 'grid grid-cols-2 gap-12' : ''}>
            <div className="space-y-6">
              {paragraphs.map((para, pi) => (
                <div key={pi} className={!compact && !translationOverride ? 'grid grid-cols-2 gap-12' : ''}>
                  {showSource && (
                    <p lang={sourceLang} className={textCls}>
                      {para.map((p) => renderPair(p, 'source'))}
                    </p>
                  )}
                  {showTarget && !translationOverride && (
                    <p lang={targetLang} className={textCls}>
                      {para.map((p) => renderPair(p, 'target'))}
                    </p>
                  )}
                </div>
              ))}
            </div>
            {!compact && translationOverride && <div>{translationOverride}</div>}
          </div>
        )}
      </div>

      <p className="sr-only" aria-live="polite">
        {announce}
      </p>

      <CounterpartSheet
        pair={sheetIndex !== null ? pairs[sheetIndex] ?? null : null}
        index={sheetIndex ?? 0}
        total={pairs.length}
        sourceLang={sourceLang}
        targetLang={targetLang}
        onClose={() => setSheetIndex(null)}
        onStep={(d) => setSheetIndex((i) => (i === null ? i : Math.min(pairs.length - 1, Math.max(0, i + d))))}
      />
    </div>
  )
}
