import React, { useEffect, useRef, useState } from 'react';
import { AudioLinesIcon, BookOpenTextIcon, ClapperboardIcon, SpellCheck2Icon } from 'lucide-react';
import type { BlockPanel } from './BlockPanels';
import { bs } from '../../data/blockStrings';
import { BookAIcon, ChevronsDownUpIcon, ChevronsUpDownIcon, DumbbellIcon, EyeIcon, LibraryIcon, ListChecksIcon, MessageSquareTextIcon, PlusIcon } from 'lucide-react';
import type { SheetBlock } from '../../types/blocks';
import type { SheetBlocksApi } from '../../hooks/useSheetBlocks';
import type { ToastState } from '../../hooks/useDocState';
import { blockText, cloneBlock, newId } from '../../utils/sheetNodes';
import { libraryDictionaries, libraryText } from '../../data/blockSamples';
import { LearnerBlockMenu } from './LearnerBlockMenu';
import { DropdownMenu, DropdownMenuItem, DropdownMenuTrigger } from '../DropdownMenu';
import { BlockFrame } from './BlockFrame';
import { BlockMenu } from './BlockMenu';
import type { BlockExtraAction } from './BlockMenu';
import { BlockView } from './BlockView';
import { TextGap } from './TextGap';
import type { TextGapHandle } from './TextGap';
import { ru } from '../../data/strings';

interface SheetBlocksProps {
  api: SheetBlocksApi;
  /** The prose editor, rendered at the prose node's position. */
  prose: React.ReactNode;
  authoring: boolean;
  touch: boolean;
  onEdit: (block: SheetBlock, isNew: boolean) => void;
  onPreview: () => void;
  notify: (t: Omit<ToastState, 'id'>) => void;
  onPanel: (panel: BlockPanel) => void;
  /** Places the caret at the end of the main text (when it is the last thing in the sheet). */
  onFocusProseEnd: () => void;
  /** Sheet setting: tinted containers for learning blocks. */
  accent: boolean;
}

const emptyGrammar = (): SheetBlock => ({ id: newId('b'), type: 'grammar', title: 'New grammar point', rule: '', pattern: '', examples: [{ id: newId('g'), source: '', translation: '' }], mistakes: [] });
const emptyBilingual = (): SheetBlock => ({ id: newId('b'), type: 'bilingual', title: 'New bilingual text', prepared: ['ru'], segments: [{ id: newId('s'), source: '', translations: {} }] });
const emptyAudio = (): SheetBlock => ({ id: newId('b'), type: 'audio', title: 'New listening', media: null, transcript: [], questions: [] });
const emptyVideo = (): SheetBlock => ({ id: newId('b'), type: 'video', title: 'New video', url: '', description: '', transcript: '' });

const emptyVocabulary = (): SheetBlock => ({ id: newId('b'), type: 'vocabulary', title: ru.blocks.newVocabularyTitle, entries: [{ id: newId('v'), term: '', translation: '' }] });
const emptyExercises = (): SheetBlock => ({
  id: newId('b'),
  type: 'exercises',
  title: ru.blocks.newExercisesTitle,
  items: [{ id: newId('e'), kind: 'choice', prompt: '', choices: ['', ''], answer: '', explanation: '', version: 1 }],
});

/** Ordered sheet: prose plus learning blocks, with shared authoring chrome, drag reorder and keyboard moves. */
export function SheetBlocks({ api, prose, authoring, touch, onEdit, onPreview, notify, onPanel, onFocusProseEnd, accent }: SheetBlocksProps) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [announce, setAnnounce] = useState('');
  const refs = useRef<Record<string, HTMLElement | null>>({});
  const gapRefs = useRef<Record<string, TextGapHandle | null>>({});
  // Blocks move among the main text and other blocks; writable lines aren't positions of their own.
  const movable = api.nodes.filter((n) => n.kind !== 'text').map((n) => n.id);

  const focusSheetEnd = () => {
    const last = api.nodes[api.nodes.length - 1];
    if (last?.kind === 'text') gapRefs.current[last.id]?.focusEnd();
    else onFocusProseEnd();
  };
  const [expandAll, setExpandAll] = useState<Record<string, { open: boolean; at: number }>>({});

  // Clicking outside the selected block clears whole-block selection.
  useEffect(() => {
    if (!api.selectedId) return;
    const onDown = (e: PointerEvent) => {
      const el = refs.current[api.selectedId!];
      const t = e.target as HTMLElement;
      if (el && !el.contains(t) && !t.closest('[role="menu"]')) api.setSelectedId(null);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [api]);

  const focusBlock = (id: string) => window.requestAnimationFrame(() => refs.current[id]?.focus());

  const select = (id: string) => {
    window.getSelection()?.removeAllRanges();
    api.setSelectedId(id);
    focusBlock(id);
  };

  const move = (id: string, dir: -1 | 1) => {
    const pos = movable.indexOf(id);
    if ((dir === -1 && pos <= 0) || (dir === 1 && pos === movable.length - 1)) return;
    api.move(id, dir);
    api.setSelectedId(id);
    setAnnounce(ru.blocks.moved(Math.max(1, pos + dir + 1), movable.length));
    focusBlock(id);
  };

  const remove = (block: SheetBlock) => {
    api.remove(block.id);
    notify({ variant: 'info', title: ru.blocks.deleted(block.title), description: ru.blocks.deletedBody, action: { label: ru.blocks.undo, onClick: () => api.undo() } });
  };

  const copy = async (block: SheetBlock) => {
    // Media and transcript-grounded blocks go through the preview-and-destination copy flow.
    if (block.type === 'audio' || block.type === 'video') {
      onPanel({ kind: 'copy', block });
      return;
    }
    try {
      await navigator.clipboard.writeText(blockText(block));
    } catch {
      /* clipboard unavailable in some previews */
    }
    notify({ variant: 'success', title: ru.blocks.copied, description: ru.blocks.copiedBody });
  };

  const extraFor = (block: SheetBlock): BlockExtraAction[] => {
    if (block.type === 'bilingual') {
      return [{ id: 'save-texts', label: bs.library.saveToTexts, icon: <BookOpenTextIcon className="h-4 w-4" />, onSelect: () => onPanel({ kind: 'library', block }), disabled: !block.segments.length }];
    }
    if (block.type !== 'vocabulary') return [];
    const n = block.entries.length;
    const train = (mode: 'cards' | 'sentences', label: string) => onPanel({ kind: 'practice', mode, label, entries: block.entries });
    const allOpen = !!expandAll[block.id]?.open;
    return [
      {
        id: 'toggle-all',
        label: allOpen ? ru.vocab.collapseAll : ru.vocab.expandAll,
        icon: allOpen ? <ChevronsDownUpIcon className="h-4 w-4" /> : <ChevronsUpDownIcon className="h-4 w-4" />,
        onSelect: () => setExpandAll((s) => ({ ...s, [block.id]: { open: !allOpen, at: Date.now() } })),
        disabled: n === 0,
      },
      { id: 'cards', label: `${ru.vocab.train} · ${ru.vocab.trainCards}`, icon: <DumbbellIcon className="h-4 w-4" />, onSelect: () => train('cards', ru.vocab.trainCards), disabled: n === 0 },
      {
        id: 'sentences',
        label: `${ru.vocab.train} · ${ru.vocab.trainSentences}`,
        icon: <MessageSquareTextIcon className="h-4 w-4" />,
        onSelect: () => train('sentences', ru.vocab.trainSentences),
        disabled: !block.entries.some((e) => e.example && e.exampleTranslation),
      },
      { id: 'save-dict', label: bs.library.saveToDictionary, icon: <LibraryIcon className="h-4 w-4" />, onSelect: () => onPanel({ kind: 'library', block }), disabled: n === 0 },
    ];
  };

  const onDragOver = (e: React.DragEvent, index: number) => {
    if (!dragId) return;
    e.preventDefault();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setDropIndex(e.clientY < r.top + r.height / 2 ? index : index + 1);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (dragId !== null && dropIndex !== null) {
      api.moveTo(dragId, dropIndex);
      api.setSelectedId(dragId);
      focusBlock(dragId);
    }
    setDragId(null);
    setDropIndex(null);
  };

  const indicator = (i: number) =>
    dragId && dropIndex === i ? (
      <div role="presentation" className="relative -mx-3 my-1 h-0.5 rounded-full bg-primary-default">
        <span className="absolute -top-2.5 left-0 rounded bg-primary-default px-1.5 text-xs font-medium text-background-surface">{ru.blocks.dropHere}</span>
      </div>
    ) : null;

  const h = touch ? 'h-11' : 'h-8';
  const rowBtn = `inline-flex items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-text-secondary hover:bg-background-subtle hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${h}`;

  return (
    <div onDrop={onDrop} onDragOver={(e) => dragId && e.preventDefault()}>
      <p className="sr-only" role="status" aria-live="polite">
        {announce}
      </p>
      {api.nodes.map((node, i) => (
        <div key={node.id} onDragOver={(e) => onDragOver(e, i)}>
          {indicator(i)}
          {node.kind === 'prose' ? (
            prose
          ) : node.kind === 'text' ? (
            <TextGap
              ref={(h) => {
                gapRefs.current[node.id] = h;
              }}
              html={node.html}
              readOnly={!authoring}
              onChange={(html) => api.setText(node.id, html)}
            />
          ) : (
            <div className="my-6">
              <BlockFrame
                ref={(el) => {
                  refs.current[node.id] = el;
                }}
                block={node.block}
                accent={accent}
                authoring={authoring}
                touch={touch}
                selected={authoring && api.selectedId === node.id}
                flashing={api.flashId === node.id}
                dragging={dragId === node.id}
                onSelect={() => select(node.id)}
                onDeselect={() => api.setSelectedId(null)}
                onMove={(dir) => move(node.id, dir)}
                onDelete={() => remove(node.block)}
                onUndo={() => api.undo()}
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('text/plain', node.block.title);
                  setDragId(node.id);
                  api.setSelectedId(node.id);
                }}
                onDragEnd={() => {
                  setDragId(null);
                  setDropIndex(null);
                }}
                learnerMenu={
                  node.block.type === 'vocabulary' ? (
                    <LearnerBlockMenu
                      block={node.block}
                      touch={touch}
                      allOpen={!!expandAll[node.id]?.open}
                      onToggleAll={() => setExpandAll((s) => ({ ...s, [node.id]: { open: !s[node.id]?.open, at: Date.now() } }))}
                      onPanel={onPanel}
                    />
                  ) : undefined
                }
                menu={
                  <BlockMenu
                    title={node.block.title}
                    touch={touch}
                    isFirst={movable.indexOf(node.id) === 0}
                    isLast={movable.indexOf(node.id) === movable.length - 1}
                    extra={extraFor(node.block)}
                    copyLabel={node.block.type === 'audio' || node.block.type === 'video' ? bs.copy.menu : undefined}
                    onEdit={() => onEdit(node.block, false)}
                    onCopy={() => copy(node.block)}
                    onDuplicate={() => {
                      const c = api.duplicate(node.id);
                      if (c) {
                        notify({ variant: 'success', title: ru.blocks.duplicated, description: ru.blocks.duplicatedBody, action: { label: ru.blocks.undo, onClick: () => api.undo() } });
                        focusBlock(c.id);
                      }
                    }}
                    onMove={(dir) => move(node.id, dir)}
                    onDelete={() => remove(node.block)}
                  />
                }
              >
                <BlockView block={node.block} variant={authoring ? 'author' : 'learner'} scope="sheet" expandAll={expandAll[node.id]} />
              </BlockFrame>
            </div>
          )}
        </div>
      ))}
      {indicator(api.nodes.length)}

      {authoring && (
        // Clicking anywhere below the last line continues writing at the end of the sheet.
        <div
          aria-hidden="true"
          className="h-24 cursor-text"
          onMouseDown={(e) => {
            e.preventDefault();
            focusSheetEnd();
          }}
        />
      )}

      {authoring && (
        <div className="flex flex-wrap items-center gap-1 border-t border-border-default pt-3">
          <DropdownMenu
            align="start"
            menuClassName="w-56"
            trigger={
              <DropdownMenuTrigger hideChevron aria-label={ru.blocks.addLabel} className={`${rowBtn} !border-0 !bg-transparent !shadow-none`}>
                <PlusIcon className="h-4 w-4" aria-hidden="true" />
                {ru.blocks.add}
              </DropdownMenuTrigger>
            }
          >
            <DropdownMenuItem icon={<BookAIcon className="h-4 w-4" />} onSelect={() => onEdit(emptyVocabulary(), true)}>
              {ru.blocks.types.vocabulary}
            </DropdownMenuItem>
            <DropdownMenuItem icon={<SpellCheck2Icon className="h-4 w-4" />} onSelect={() => onEdit(emptyGrammar(), true)}>
              {ru.blocks.types.grammar}
            </DropdownMenuItem>
            <DropdownMenuItem icon={<BookOpenTextIcon className="h-4 w-4" />} onSelect={() => onEdit(emptyBilingual(), true)}>
              {ru.blocks.types.bilingual}
            </DropdownMenuItem>
            <DropdownMenuItem icon={<AudioLinesIcon className="h-4 w-4" />} onSelect={() => onEdit(emptyAudio(), true)}>
              {ru.blocks.types.audio}
            </DropdownMenuItem>
            <DropdownMenuItem icon={<ClapperboardIcon className="h-4 w-4" />} onSelect={() => onEdit(emptyVideo(), true)}>
              {ru.blocks.types.video}
            </DropdownMenuItem>
            <DropdownMenuItem icon={<ListChecksIcon className="h-4 w-4" />} onSelect={() => onEdit(emptyExercises(), true)}>
              {ru.blocks.types.exercises}
            </DropdownMenuItem>
          </DropdownMenu>
          <DropdownMenu
            align="start"
            menuClassName="w-64"
            trigger={
              <DropdownMenuTrigger hideChevron aria-label={ru.blocks.libraryLabel} className={`${rowBtn} !border-0 !bg-transparent !shadow-none`}>
                <LibraryIcon className="h-4 w-4" aria-hidden="true" />
                {ru.blocks.insertLibrary}
              </DropdownMenuTrigger>
            }
          >
            {libraryDictionaries.map((d) => (
              <DropdownMenuItem
                key={d.id}
                icon={<BookAIcon className="h-4 w-4" />}
                onSelect={() => {
                  const copyBlock = cloneBlock({ id: d.id, type: 'vocabulary', title: d.name, entries: d.entries });
                  api.insert([copyBlock]);
                  notify({ variant: 'success', title: ru.blocks.libraryInserted(d.name), description: ru.blocks.libraryNote, action: { label: ru.blocks.undo, onClick: () => api.undo() } });
                }}
              >
                {ru.blocks.libraryDictionary(d.name, d.entries.length)}
              </DropdownMenuItem>
            ))}
            <DropdownMenuItem
              icon={<BookOpenTextIcon className="h-4 w-4" />}
              onSelect={() => {
                api.insert([cloneBlock(libraryText)]);
                notify({ variant: 'success', title: ru.blocks.libraryInserted(libraryText.title), description: ru.blocks.libraryNote, action: { label: ru.blocks.undo, onClick: () => api.undo() } });
              }}
            >
              {bs.libraryText.insert(libraryText.title, libraryText.segments.length)}
            </DropdownMenuItem>
          </DropdownMenu>
          <span className="flex-1" />
          <button type="button" onClick={onPreview} className={rowBtn}>
            <EyeIcon className="h-4 w-4" aria-hidden="true" />
            {ru.learner.preview}
          </button>
        </div>
      )}
    </div>
  );
}

