import React from 'react'
import { ReadingView } from '../reading/ReadingView'
import { CollectLayer } from './CollectLayer'
import { useCollect } from '../../hooks/useCollect'
import type { LanguageCode, SentencePair, Side } from '../../types/texts'

interface CollectableReadingProps {
  pairs: SentencePair[]
  sourceLang: LanguageCode
  targetLang: LanguageCode
  matchMode: boolean
  compact: boolean
  topSlot?: React.ReactNode
  tab?: Side
  onTabChange?: (tab: Side) => void
  showEditedMarkers?: boolean
  requireSignIn?: boolean
  onSignIn?: () => void
  previewExpired?: boolean
}

/** Read-mode text with native selection → Add to dictionary. */
export function CollectableReading({
  pairs,
  sourceLang,
  targetLang,
  matchMode,
  compact,
  topSlot,
  tab,
  onTabChange,
  showEditedMarkers,
  requireSignIn,
  onSignIn,
  previewExpired,
}: CollectableReadingProps) {
  const collect = useCollect({ pairs, sourceLang, targetLang, requireSignIn, onSignIn, previewExpired })
  return (
    <>
      <ReadingView
        pairs={pairs}
        sourceLang={sourceLang}
        targetLang={targetLang}
        matchMode={matchMode}
        compact={compact}
        marks={collect.marks}
        onSelection={collect.onSelection}
        topSlot={topSlot}
        tab={tab}
        onTabChange={onTabChange}
        showEditedMarkers={showEditedMarkers}
      />
      <CollectLayer collect={collect} compact={compact} />
    </>
  )
}
