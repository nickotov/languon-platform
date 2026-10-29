import React, { useMemo, useRef, useState } from 'react';
import { AlertTriangleIcon } from 'lucide-react';
import type { SheetBlock } from '../../types/blocks';
import { useFieldAi } from '../../hooks/useFieldAi';
import type { FieldAiResolver } from '../../hooks/useFieldAi';
import { bumpChangedVersions } from '../../utils/sheetNodes';
import { referenceTranslations } from '../../data/blockSamples';
import { Button } from '../Button';
import { SidePanel } from './SidePanel';
import { blockIcons } from './BlockView';
import { VocabularyEditor, vocabErrors } from './vocabulary/VocabularyEditor';
import { ExercisesEditor, exerciseErrors } from './exercises/ExercisesEditor';
import { GrammarEditor, grammarErrors } from './grammar/GrammarEditor';
import { BilingualEditor, bilingualErrors } from './bilingual/BilingualEditor';
import { AudioEditor, audioErrors } from './audio/AudioEditor';
import { VideoEditor, videoErrors } from './video/VideoEditor';
import { ru } from '../../data/strings';

interface BlockEditorDialogProps {
  block: SheetBlock;
  isNew: boolean;
  mobile: boolean;
  fieldAiFails: boolean;
  onApply: (block: SheetBlock) => void;
  onClose: () => void;
}

const norm = (s: string) => s.trim().toLowerCase().replace(/[.!]/g, '');

/**
 * The single active block editor. Edits stay in a local draft until Apply changes;
 * Cancel / Escape / outside click on a dirty draft asks before discarding.
 */
export function BlockEditorDialog({ block, isNew, mobile, fieldAiFails, onApply, onClose }: BlockEditorDialogProps) {
  const [draft, setDraft] = useState<SheetBlock>(block);
  const [showErrors, setShowErrors] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  /** Prototype stand-in for field-level Check / Generate, scoped to one entry and field. */
  const resolve: FieldAiResolver = (fieldKey, kind, value) => {
    const b = draftRef.current;
    if (b.type !== 'vocabulary') return { ok: false };
    const entry = b.entries.find((e) => fieldKey.startsWith(`${e.id}-`));
    if (!entry) return { ok: false };
    const ref = referenceTranslations[entry.term.trim().toLowerCase()];
    const field = fieldKey.slice(entry.id.length + 1);
    const expected = field === 'exampleTranslation' ? ref?.exampleTranslation : ref?.translation;
    if (!expected) return { ok: false };
    if (kind === 'check' && norm(value) === norm(expected)) return { ok: true, note: field === 'translation' ? ref?.note : undefined };
    return { ok: false, proposed: expected, note: kind === 'check' ? ref?.note ?? 'A more natural Russian equivalent.' : undefined };
  };
  const ai = useFieldAi(resolve, fieldAiFails);

  const dirty = useMemo(() => isNew || JSON.stringify(draft) !== JSON.stringify(block), [draft, block, isNew]);
  const errors = errorsFor(draft);
  const Icon = blockIcons[block.type];
  const typeLabel = ru.blocks.types[block.type];

  const requestClose = () => (dirty ? setConfirming(true) : onClose());

  const apply = () => {
    if (errors > 0) {
      setShowErrors(true);
      return;
    }
    onApply(bumpChangedVersions(block, draft));
  };

  const footer = confirming ? (
    <div role="alertdialog" aria-labelledby="discard-title" className="flex flex-wrap items-center gap-2">
      <div className="min-w-0 flex-1">
        <p id="discard-title" className="flex items-center gap-1.5 text-sm font-semibold text-text-primary">
          <AlertTriangleIcon className="h-4 w-4 text-warning-default" aria-hidden="true" />
          {ru.editor.discardTitle}
        </p>
        <p className="text-xs text-text-secondary">{ru.editor.discardBody}</p>
      </div>
      <Button size="compact" variant="secondary" onClick={() => setConfirming(false)} autoFocus>
        {ru.editor.keepEditing}
      </Button>
      <Button size="compact" variant="danger" onClick={onClose}>
        {ru.editor.discard}
      </Button>
    </div>
  ) : (
    <div className="flex flex-wrap items-center gap-2">
      <p className={`min-w-0 flex-1 text-xs leading-5 ${showErrors && errors ? 'text-danger-default' : 'text-text-tertiary'}`} aria-live="polite">
        {showErrors && errors ? ru.editor.fixErrors(errors) : dirty ? ru.editor.draftNote : ru.editor.unchanged}
      </p>
      <Button size={mobile ? 'default' : 'compact'} variant="ghost" onClick={requestClose}>
        {ru.editor.cancel}
      </Button>
      <Button size={mobile ? 'default' : 'compact'} onClick={apply} disabled={!dirty}>
        {ru.editor.apply}
      </Button>
    </div>
  );

  return (
    <SidePanel
      title={draft.title.trim() || typeLabel}
      subtitle={`${ru.editor.label(typeLabel)} · ${ru.fieldAi.credits}`}
      icon={<Icon className="h-4 w-4" aria-hidden="true" />}
      mobile={mobile}
      container={null}
      onRequestClose={() => (confirming ? setConfirming(false) : requestClose())}
      footer={footer}
    >
      {draft.type === 'vocabulary' ? (
        <VocabularyEditor draft={draft} onChange={setDraft} ai={ai} touch={mobile} showErrors={showErrors} />
      ) : draft.type === 'exercises' ? (
        <ExercisesEditor draft={draft} original={block.type === 'exercises' ? block : draft} onChange={setDraft} touch={mobile} showErrors={showErrors} />
      ) : draft.type === 'grammar' ? (
        <GrammarEditor draft={draft} onChange={setDraft} touch={mobile} showErrors={showErrors} />
      ) : draft.type === 'bilingual' ? (
        <BilingualEditor draft={draft} onChange={setDraft} touch={mobile} showErrors={showErrors} />
      ) : draft.type === 'audio' ? (
        <AudioEditor draft={draft} original={block.type === 'audio' ? block : draft} onChange={setDraft} touch={mobile} showErrors={showErrors} />
      ) : (
        <VideoEditor draft={draft} onChange={setDraft} touch={mobile} showErrors={showErrors} />
      )}
    </SidePanel>
  );
}

function errorsFor(b: SheetBlock): number {
  switch (b.type) {
    case 'vocabulary':
      return vocabErrors(b);
    case 'exercises':
      return exerciseErrors(b);
    case 'grammar':
      return grammarErrors(b);
    case 'bilingual':
      return bilingualErrors(b);
    case 'audio':
      return audioErrors(b);
    case 'video':
      return videoErrors(b);
  }
}

