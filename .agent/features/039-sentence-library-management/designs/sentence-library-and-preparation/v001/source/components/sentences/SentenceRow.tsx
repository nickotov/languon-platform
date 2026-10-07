import React from 'react'
import { EyeIcon, EyeOffIcon, MoreHorizontalIcon, RotateCcwIcon } from 'lucide-react'
import { Checkbox } from '../Checkbox'
import { Button } from '../Button'
import { DropdownMenu, DropdownMenuItem, DropdownMenuTrigger } from '../DropdownMenu'
import { DirectionBadge, OwnershipMeta, StatusBadges } from './SentenceBadges'
import { useInterfaceText } from '../../hooks/useInterfaceText'
import type { SavedSentence } from '../../types/sentenceLibrary'

interface SentenceRowProps {
  sentence: SavedSentence
  selected: boolean
  locked?: boolean
  onToggle: () => void
  onView: (trigger: HTMLElement) => void
  onArchiveToggle: () => void
}

/** Compact, scannable row. The reference stays hidden until the detail preview. */
export function SentenceRow({ sentence, selected, locked = false, onToggle, onView, onArchiveToggle }: SentenceRowProps) {
  const { L } = useInterfaceText()
  const preview = sentence.sentence.length > 60 ? `${sentence.sentence.slice(0, 60)}…` : sentence.sentence
  const archiveLabel = sentence.archivedByMe ? L('restore') : L('removeMine')
  const restoreNote = sentence.archivedByMe && sentence.globallyArchived ? L('restoreBlockedGlobal') : undefined

  return (
    <li
      data-sentence-id={sentence.id}
      className={`flex gap-3 rounded-xl border p-3 transition-colors sm:p-4 ${
        selected ? 'border-primary-default bg-primary-subtle' : 'border-border-default bg-background-surface'
      }`}
    >
      <div className="pt-0.5">
        <Checkbox size="md" checked={selected} disabled={locked} onChange={onToggle} aria-label={L('rowSelect', { sentence: preview })} />
      </div>

      <div className="min-w-0 flex-1">
        <p lang={sentence.sentenceLanguage} dir="auto" className="break-words text-base leading-relaxed text-text-primary [overflow-wrap:anywhere]">
          {sentence.sentence}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <DirectionBadge from={sentence.sentenceLanguage} to={sentence.answerLanguage} />
          <StatusBadges sentence={sentence} />
          <OwnershipMeta sentence={sentence} />
        </div>
      </div>

      <div className="hidden shrink-0 items-start gap-2 md:flex">
        <Button size="compact" variant="secondary" leadingIcon={<EyeIcon aria-hidden className="h-4 w-4" />} onClick={(e) => onView(e.currentTarget)}>
          {L('view')}
        </Button>
        <Button
          size="compact"
          variant="secondary"
          disabled={locked}
          title={restoreNote}
          leadingIcon={sentence.archivedByMe ? <RotateCcwIcon aria-hidden className="h-4 w-4" /> : <EyeOffIcon aria-hidden className="h-4 w-4" />}
          onClick={onArchiveToggle}
          aria-label={`${archiveLabel}: ${preview}`}
        >
          {sentence.archivedByMe ? L('restore') : L('removeShort')}
        </Button>
      </div>

      <div className="shrink-0 md:hidden">
        <DropdownMenu
          align="end"
          menuClassName="bg-background-elevated text-text-primary border-border-default"
          trigger={
            <DropdownMenuTrigger
              hideChevron
              aria-label={L('rowActions', { sentence: preview })}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border-strong bg-background-surface text-text-primary hover:bg-background-subtle"
            >
              <MoreHorizontalIcon aria-hidden className="h-4 w-4" />
            </DropdownMenuTrigger>
          }
        >
          <DropdownMenuItem
            icon={<EyeIcon aria-hidden className="h-4 w-4" />}
            onSelect={() => {
              const row = document.querySelector<HTMLElement>(`[data-sentence-id="${sentence.id}"] input`)
              onView(row ?? document.body)
            }}
          >
            {L('view')}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={locked}
            icon={sentence.archivedByMe ? <RotateCcwIcon aria-hidden className="h-4 w-4" /> : <EyeOffIcon aria-hidden className="h-4 w-4" />}
            onSelect={onArchiveToggle}
          >
            {archiveLabel}
          </DropdownMenuItem>
        </DropdownMenu>
      </div>
    </li>
  )
}

