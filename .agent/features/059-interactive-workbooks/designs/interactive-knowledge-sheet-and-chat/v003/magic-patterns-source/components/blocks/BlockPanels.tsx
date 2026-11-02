import React from 'react';
import type { AudioBlock, BilingualBlock, SheetBlock, VideoBlock, VocabEntry, VocabularyBlock } from '../../types/blocks';
import type { ToastState } from '../../hooks/useDocState';
import { LibrarySaveDialog } from './library/LibrarySaveDialog';
import { PracticePreview } from './library/PracticePreview';
import { CopyMediaDialog } from './library/CopyMediaDialog';
import { bs } from '../../data/blockStrings';

/** Secondary block flows opened from a block's settings menu. Only one is open at a time. */
export type BlockPanel =
  | { kind: 'practice'; mode: 'cards' | 'sentences'; label: string; entries: VocabEntry[] }
  | { kind: 'library'; block: VocabularyBlock | BilingualBlock }
  | { kind: 'copy'; block: AudioBlock | VideoBlock };

interface BlockPanelsProps {
  panel: BlockPanel | null;
  mobile: boolean;
  libraryFails: boolean;
  onClose: () => void;
  notify: (t: Omit<ToastState, 'id'>) => void;
  /** Inserts a copy into this sheet's working draft (author only). */
  onInsert?: (block: SheetBlock) => void;
}

export function BlockPanels({ panel, mobile, libraryFails, onClose, notify, onInsert }: BlockPanelsProps) {
  if (!panel) return null;
  if (panel.kind === 'practice') {
    return <PracticePreview mode={panel.mode} modeLabel={panel.label} entries={panel.entries} mobile={mobile} onClose={onClose} />;
  }
  if (panel.kind === 'copy') {
    return (
      <CopyMediaDialog
        block={panel.block}
        mobile={mobile}
        fails={libraryFails}
        onClose={onClose}
        onInsertHere={(b) => onInsert?.(b)}
        onCopiedElsewhere={(s) => notify({ variant: 'success', title: bs.copy.doneOther(s), description: bs.copy.independent })}
      />
    );
  }
  return (
    <LibrarySaveDialog
      key={panel.block.id}
      block={panel.block}
      mobile={mobile}
      fails={libraryFails}
      onClose={onClose}
      onSaved={(name) => notify({ variant: 'success', title: bs.library.success(name), description: bs.library.independent })}
    />
  );
}

