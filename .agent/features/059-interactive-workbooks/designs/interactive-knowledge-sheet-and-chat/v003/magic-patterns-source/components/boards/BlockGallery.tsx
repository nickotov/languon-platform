import React from 'react';
import type { SheetBlock } from '../../types/blocks';
import { audioBlock, bilingualBlock, grammarBlock, savedExercisesBlock, vocabularyProposalBlock, videoBlock } from '../../data/blockSamples';
import { BlockFrame } from '../blocks/BlockFrame';
import { BlockView, blockCountLabel, blockIcons } from '../blocks/BlockView';
import { BlockMenu } from '../blocks/BlockMenu';
import { BoardCard, BoardSection, BoardShell } from './BoardShell';
import { ru } from '../../data/strings';

const samples: SheetBlock[] = [vocabularyProposalBlock(), grammarBlock, bilingualBlock, audioBlock, videoBlock, savedExercisesBlock];
const noop = () => undefined;

/** One block, four contexts: compact chat preview, expanded review, sheet authoring, learner practice. */
export function BlockGallery({ mobile }: { mobile: boolean }) {
  return (
    <BoardShell
      mobile={mobile}
      title="Block families · four presentation contexts"
      subtitle="The same block keeps its identity and hierarchy in every context. Chat previews are for judging material, review exposes prepared answers and translations, authoring adds the shared grip / heading / settings row, and learner view has practice without authoring chrome. Everything here is interactive."
      nav={samples.map((b) => ({ id: `fam-${b.type}`, label: ru.blocks.types[b.type] }))}
    >
      {samples.map((b) => {
        const Icon = blockIcons[b.type];
        return (
          <BoardSection key={b.id} id={`fam-${b.type}`} title={ru.blocks.types[b.type]} note={`${b.title} · ${blockCountLabel(b)}`}>
            <div className="grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
              <BoardCard label="A · Compact chat preview (unapplied proposal)">
                <div className="rounded-xl border border-border-default">
                  <div className="flex items-center gap-2 border-b border-border-default px-3 py-2">
                    <Icon className="h-4 w-4 text-text-tertiary" aria-hidden="true" />
                    <p className="min-w-0 flex-1 truncate text-xs font-semibold text-text-primary">
                      {ru.blocks.types[b.type]} · {blockCountLabel(b)}
                    </p>
                    <span className="rounded-full bg-background-subtle px-2 py-0.5 text-xs text-text-secondary">{ru.proposal.notInSheet}</span>
                  </div>
                  <div className="px-3 pb-2 pt-1.5">
                    <p className="pb-0.5 text-sm font-medium text-text-primary">{b.title}</p>
                    <BlockView block={b} variant="compact" scope={`gal-compact-${b.id}`} />
                  </div>
                </div>
              </BoardCard>
              <BoardCard label="B · Expanded proposal review (prepared answers visible)">
                <BlockView block={b} variant="review" scope={`gal-review-${b.id}`} />
              </BoardCard>
              <div className="grid gap-5 lg:col-span-2 lg:grid-cols-2">
              <BoardCard label="C · Sheet authoring (hover for grip; ellipsis opens settings)">
                <div className="px-6">
                  <BlockFrame
                    block={b}
                    accent
                    authoring
                    touch={mobile}
                    selected={false}
                    flashing={false}
                    dragging={false}
                    onSelect={noop}
                    onDeselect={noop}
                    onMove={noop}
                    onDelete={noop}
                    onUndo={noop}
                    onDragStart={noop}
                    onDragEnd={noop}
                    menu={<BlockMenu title={b.title} touch={mobile} isFirst={false} isLast={false} onEdit={noop} onCopy={noop} onDuplicate={noop} onMove={noop} onDelete={noop} />}
                  >
                    <BlockView block={b} variant="author" scope={`gal-author-${b.id}`} />
                  </BlockFrame>
                </div>
              </BoardCard>
              <BoardCard label="D · Learner study / practice (private progress)">
                <div className="px-3">
                  <BlockFrame
                    block={b}
                    accent
                    authoring={false}
                    touch={mobile}
                    selected={false}
                    flashing={false}
                    dragging={false}
                    onSelect={noop}
                    onDeselect={noop}
                    onMove={noop}
                    onDelete={noop}
                    onUndo={noop}
                    onDragStart={noop}
                    onDragEnd={noop}
                  >
                    <BlockView block={b} variant="learner" scope={`gal-learner-${b.id}`} />
                  </BlockFrame>
                </div>
              </BoardCard>
              </div>
            </div>
          </BoardSection>
        );
      })}
    </BoardShell>
  );
}

