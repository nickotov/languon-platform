import React from 'react';
import { ChevronsDownUpIcon, ChevronsUpDownIcon, DumbbellIcon, EllipsisIcon, MessageSquareTextIcon } from 'lucide-react';
import type { VocabularyBlock } from '../../types/blocks';
import type { BlockPanel } from './BlockPanels';
import { DropdownMenu, DropdownMenuItem, DropdownMenuTrigger } from '../DropdownMenu';
import { bs } from '../../data/blockStrings';
import { ru } from '../../data/strings';

interface LearnerBlockMenuProps {
  block: VocabularyBlock;
  touch: boolean;
  allOpen: boolean;
  onToggleAll: () => void;
  onPanel: (p: BlockPanel) => void;
}

/** Study options for readers and learner preview. Practice is private and never edits the sheet. */
export function LearnerBlockMenu({ block, touch, allOpen, onToggleAll, onPanel }: LearnerBlockMenuProps) {
  const icon = 'h-4 w-4';
  return (
    <DropdownMenu
      align="end"
      menuClassName="w-60"
      trigger={
        <DropdownMenuTrigger
          hideChevron
          aria-label={bs.learner.actions(block.title)}
          className={`inline-flex items-center justify-center rounded-lg !border-0 !bg-transparent !p-0 !shadow-none text-text-tertiary hover:!bg-background-subtle hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${touch ? '!h-11 !w-11' : '!h-8 !w-8'}`}
        >
          <EllipsisIcon className="h-4 w-4" aria-hidden="true" />
        </DropdownMenuTrigger>
      }
    >
      <DropdownMenuItem icon={allOpen ? <ChevronsDownUpIcon className={icon} /> : <ChevronsUpDownIcon className={icon} />} onSelect={onToggleAll} disabled={!block.entries.length}>
        {allOpen ? ru.vocab.collapseAll : ru.vocab.expandAll}
      </DropdownMenuItem>
      <DropdownMenuItem
        icon={<DumbbellIcon className={icon} />}
        disabled={!block.entries.length}
        onSelect={() => onPanel({ kind: 'practice', mode: 'cards', label: ru.vocab.trainCards, entries: block.entries })}
      >
        {`${ru.vocab.train} · ${ru.vocab.trainCards}`}
      </DropdownMenuItem>
      <DropdownMenuItem
        icon={<MessageSquareTextIcon className={icon} />}
        disabled={!block.entries.some((e) => e.example && e.exampleTranslation)}
        onSelect={() => onPanel({ kind: 'practice', mode: 'sentences', label: ru.vocab.trainSentences, entries: block.entries })}
      >
        {`${ru.vocab.train} · ${ru.vocab.trainSentences}`}
      </DropdownMenuItem>
    </DropdownMenu>
  );
}

