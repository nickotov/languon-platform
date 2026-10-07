import React from 'react'
import { ArchiveIcon, ArrowRightIcon, ClockIcon, EyeOffIcon, UserIcon, UsersIcon } from 'lucide-react'
import { Badge } from '../Badge'
import { useInterfaceText } from '../../hooks/useInterfaceText'
import type { SavedSentence } from '../../types/sentenceLibrary'
import type { LanguageCode } from '../../types/dictionary'

/** Explicit direction: short codes visually, the full language pair for assistive tech. */
export function DirectionBadge({ from, to }: { from: LanguageCode; to: LanguageCode }) {
  const { direction } = useInterfaceText()
  const label = direction(from, to)
  return (
    <Badge size="sm" tone="info" title={label} aria-label={label} className="shrink-0">
      <span aria-hidden className="inline-flex items-center gap-1 font-semibold uppercase tracking-wide">
        {from}
        <ArrowRightIcon className="h-3 w-3 rtl:rotate-180" />
        {to}
      </span>
    </Badge>
  )
}

/** Independent status reasons — each with icon + text, never colour alone. */
export function StatusBadges({ sentence }: { sentence: SavedSentence }) {
  const { L } = useInterfaceText()
  return (
    <>
      {sentence.outdated ? (
        <Badge size="sm" tone="warning" icon={<ClockIcon aria-hidden />}>
          {L('badgeOutdated')}
        </Badge>
      ) : null}
      {sentence.archivedByMe ? (
        <Badge size="sm" tone="neutral" icon={<EyeOffIcon aria-hidden />}>
          {L('badgeArchivedMine')}
        </Badge>
      ) : null}
      {sentence.globallyArchived ? (
        <Badge size="sm" tone="neutral" icon={<ArchiveIcon aria-hidden />}>
          {L('badgeGlobal')}
        </Badge>
      ) : null}
    </>
  )
}

export function OwnershipMeta({ sentence }: { sentence: SavedSentence }) {
  const { L, date } = useInterfaceText()
  const Icon = sentence.ownership === 'mine' ? UserIcon : UsersIcon
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-text-secondary">
      <span>{L('savedOn', { date: date(sentence.createdAt) })}</span>
      <span aria-hidden>·</span>
      <span className="inline-flex items-center gap-1">
        <Icon aria-hidden className="h-3.5 w-3.5" />
        {sentence.ownership === 'mine' ? L('markerMine') : L('markerShared')}
      </span>
    </span>
  )
}

