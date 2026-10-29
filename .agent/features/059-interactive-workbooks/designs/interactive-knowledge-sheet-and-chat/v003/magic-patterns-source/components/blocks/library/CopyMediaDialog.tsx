import React, { useState } from 'react';
import { AlertCircleIcon, CheckCircle2Icon, CopyIcon, FileAudioIcon, FileTextIcon, LinkIcon, ListChecksIcon } from 'lucide-react';
import type { AudioBlock, SheetBlock, VideoBlock } from '../../../types/blocks';
import { cloneBlock, detectVideo } from '../../../utils/sheetNodes';
import { Button } from '../../Button';
import { SidePanel } from '../SidePanel';
import { bs } from '../../../data/blockStrings';

interface CopyMediaDialogProps {
  block: AudioBlock | VideoBlock;
  mobile: boolean;
  fails: boolean;
  onClose: () => void;
  onInsertHere: (copy: SheetBlock) => void;
  onCopiedElsewhere: (sheet: string) => void;
}

type Dest = 'here' | 'other' | 'stale';
const OTHER = 'Au marché';
const STALE = 'Dans la cuisine';

/**
 * Copy for blocks that depend on media or a transcript: shows exactly what travels with the copy and
 * where it goes, instead of a clipboard result that would lose the recording or grounding passages.
 */
export function CopyMediaDialog({ block, mobile, fails, onClose, onInsertHere, onCopiedElsewhere }: CopyMediaDialogProps) {
  const [dest, setDest] = useState<Dest>('here');
  const [phase, setPhase] = useState<'edit' | 'copying' | 'done' | 'failed' | 'stale'>('edit');
  const [failOnce, setFailOnce] = useState(fails);
  const size = mobile ? 'default' : 'compact';

  const deps: { icon: React.ReactNode; text: string; note?: string }[] =
    block.type === 'audio'
      ? [
          ...(block.media ? [{ icon: <FileAudioIcon className="h-4 w-4" />, text: block.media.kind === 'upload' ? block.media.name : bs.audio.generated, note: bs.copy.recordingNote }] : []),
          ...(block.transcript.length ? [{ icon: <FileTextIcon className="h-4 w-4" />, text: bs.copy.transcript(block.transcript.length) }] : []),
          ...(block.questions.length ? [{ icon: <ListChecksIcon className="h-4 w-4" />, text: bs.copy.questions(block.questions.length) }] : []),
        ]
      : [
          { icon: <LinkIcon className="h-4 w-4" />, text: detectVideo(block.url)?.host ?? block.url, note: bs.copy.videoNote },
          ...(block.transcript ? [{ icon: <FileTextIcon className="h-4 w-4" />, text: bs.video.transcript }] : []),
        ];

  const confirm = () => {
    setPhase('copying');
    window.setTimeout(() => {
      if (dest === 'stale') return setPhase('stale');
      if (failOnce) {
        setFailOnce(false);
        return setPhase('failed');
      }
      setPhase('done');
      if (dest === 'here') onInsertHere(cloneBlock(block));
      else onCopiedElsewhere(OTHER);
    }, 800);
  };

  const option = (value: Dest, label: string, detail: string) => (
    <label className={`flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5 ${dest === value ? 'border-primary-default bg-primary-subtle' : 'border-border-default hover:bg-background-subtle'}`}>
      <input type="radio" name="copy-dest" checked={dest === value} onChange={() => { setDest(value); if (phase === 'stale') setPhase('edit'); }} className="mt-1 accent-primary-600" />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-text-primary">{label}</span>
        <span className="block text-xs text-text-tertiary">{detail}</span>
      </span>
    </label>
  );

  return (
    <SidePanel
      title={bs.copy.title}
      subtitle={block.title}
      icon={<CopyIcon className="h-4 w-4" aria-hidden="true" />}
      mobile={mobile}
      container={null}
      onRequestClose={() => phase !== 'copying' && onClose()}
      footer={
        phase === 'done' ? (
          <div className="flex justify-end">
            <Button size={size} onClick={onClose}>
              {bs.library.done}
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <p className="min-w-0 flex-1 text-xs text-text-tertiary">{bs.copy.noHistory}</p>
            <Button size={size} variant="ghost" onClick={onClose} disabled={phase === 'copying'}>
              {bs.library.cancel}
            </Button>
            <Button size={size} onClick={confirm} loading={phase === 'copying'} disabled={phase === 'stale'}>
              {phase === 'failed' ? bs.library.retry : bs.copy.confirm}
            </Button>
          </div>
        )
      }
    >
      {phase === 'done' ? (
        <div role="status" className="flex flex-col items-start gap-2 py-4">
          <CheckCircle2Icon className="h-6 w-6 text-success-default" aria-hidden="true" />
          <p className="text-base font-semibold text-text-primary">{dest === 'here' ? bs.copy.doneHere : bs.copy.doneOther(OTHER)}</p>
          <p className="text-sm leading-6 text-text-secondary">{bs.copy.independent}</p>
        </div>
      ) : (
        <fieldset disabled={phase === 'copying'} className="space-y-5">
          <div>
            <p className="mb-1.5 text-sm font-semibold text-text-primary">{bs.copy.included}</p>
            <ul className="space-y-1.5">
              {deps.map((d) => (
                <li key={d.text} className="flex items-start gap-2 text-sm text-text-primary">
                  <span className="mt-0.5 text-text-tertiary" aria-hidden="true">
                    {d.icon}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate">{d.text}</span>
                    {d.note && <span className="block text-xs text-text-tertiary">{d.note}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-semibold text-text-primary">{bs.library.stepDestination}</p>
            {option('here', bs.copy.here, bs.copy.hereDetail)}
            {option('other', OTHER, bs.copy.otherDetail)}
            {option('stale', STALE, bs.copy.otherDetail)}
          </div>
          {phase === 'stale' && (
            <p role="alert" className="flex items-start gap-1.5 rounded-lg bg-warning-subtle px-3 py-2 text-sm text-text-primary">
              <AlertCircleIcon className="mt-0.5 h-4 w-4 shrink-0 text-warning-default" aria-hidden="true" />
              {bs.copy.stale(STALE)}
            </p>
          )}
          {phase === 'failed' && (
            <p role="alert" className="flex items-start gap-1.5 rounded-lg bg-danger-subtle px-3 py-2 text-sm text-text-primary">
              <AlertCircleIcon className="mt-0.5 h-4 w-4 shrink-0 text-danger-default" aria-hidden="true" />
              {bs.copy.failed}
            </p>
          )}
        </fieldset>
      )}
    </SidePanel>
  );
}

