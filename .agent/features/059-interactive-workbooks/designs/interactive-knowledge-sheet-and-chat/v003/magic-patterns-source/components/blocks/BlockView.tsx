import React from 'react';
import { AudioLinesIcon, BookAIcon, BookOpenTextIcon, ClapperboardIcon, ListChecksIcon, SpellCheck2Icon } from 'lucide-react';
import type { BlockType, BlockVariant, SheetBlock } from '../../types/blocks';
import { VocabularyView } from './vocabulary/VocabularyView';
import { ExercisesView } from './exercises/ExercisesView';
import { GrammarView } from './grammar/GrammarView';
import { BilingualView } from './bilingual/BilingualView';
import { AudioView } from './audio/AudioView';
import { VideoView } from './video/VideoView';
import { detectVideo } from '../../utils/sheetNodes';
import { bs } from '../../data/blockStrings';
import { ru } from '../../data/strings';

export const blockIcons: Record<BlockType, typeof BookAIcon> = {
  vocabulary: BookAIcon,
  exercises: ListChecksIcon,
  grammar: SpellCheck2Icon,
  bilingual: BookOpenTextIcon,
  audio: AudioLinesIcon,
  video: ClapperboardIcon,
};

export function blockCountLabel(block: SheetBlock): string {
  switch (block.type) {
    case 'vocabulary':
      return ru.proposal.entries(block.entries.length);
    case 'exercises':
      return ru.proposal.items(block.items.length);
    case 'grammar':
      return bs.counts.sections([block.rule, block.pattern, block.examples.length, block.mistakes.length].filter(Boolean).length);
    case 'bilingual':
      return bs.counts.segments(block.segments.length);
    case 'audio':
      return block.media ? `${bs.time(block.media.duration)} · ${bs.counts.questions(block.questions.length)}` : bs.counts.noRecording;
    case 'video': {
      const info = detectVideo(block.url);
      return info ? bs.video.detected[info.provider] : bs.video.urlInvalid;
    }
  }
}

/** Dispatches a block to its family renderer for the given presentation context. */
export function BlockView({
  block,
  variant,
  scope,
  expandAll,
}: {
  block: SheetBlock;
  variant: BlockVariant;
  scope: string;
  /** Set from the block's settings menu: open or close every collapsible row. */
  expandAll?: { open: boolean; at: number };
}) {
  switch (block.type) {
    case 'vocabulary':
      return <VocabularyView block={block} variant={variant} scope={scope} expandAll={expandAll} />;
    case 'exercises':
      return <ExercisesView block={block} variant={variant} />;
    case 'grammar':
      return <GrammarView block={block} variant={variant} scope={scope} />;
    case 'bilingual':
      return <BilingualView block={block} variant={variant} scope={scope} />;
    case 'audio':
      return <AudioView block={block} variant={variant} scope={scope} />;
    case 'video':
      return <VideoView block={block} variant={variant} />;
  }
}

