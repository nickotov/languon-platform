import React, { useEffect, useRef, useState } from 'react';
import { AlertCircleIcon, CheckCircle2Icon, FileAudioIcon, Loader2Icon, SparklesIcon, UploadIcon } from 'lucide-react';
import type { AudioBlock, ExercisesBlock } from '../../../types/blocks';
import { newId } from '../../../utils/sheetNodes';
import { useBlockRuntime } from '../../../contexts/BlockRuntimeContext';
import { AddButton, Field, RemoveButton, SectionLabel, TitleField } from '../EditorFields';
import { ExercisesEditor, exerciseErrors } from '../exercises/ExercisesEditor';
import { bs } from '../../../data/blockStrings';

interface AudioEditorProps {
  draft: AudioBlock;
  original: AudioBlock;
  onChange: (next: AudioBlock) => void;
  touch: boolean;
  showErrors: boolean;
}

type Upload =
  | { status: 'idle' }
  | { status: 'validating'; name: string }
  | { status: 'uploading'; name: string; pct: number }
  | { status: 'invalid' | 'tooLarge' | 'failed'; name: string }
  | { status: 'ready'; name: string };

type Gen = { status: 'idle' } | { status: 'generating' } | { status: 'preview' };

const MAX_MB = 25;
const OK_TYPES = /\.(mp3|m4a|wav|ogg)$/i;

const asExercises = (b: AudioBlock): ExercisesBlock => ({ id: `${b.id}-q`, type: 'exercises', title: b.title || 'audio', items: b.questions });

export const audioErrors = (b: AudioBlock) => (b.title.trim() ? 0 : 1) + (b.questions.length ? exerciseErrors(asExercises(b)) : 0);

export function AudioEditor({ draft, original, onChange, touch, showErrors }: AudioEditorProps) {
  const rt = useBlockRuntime();
  const [upload, setUpload] = useState<Upload>({ status: 'idle' });
  const [gen, setGen] = useState<Gen>({ status: 'idle' });
  const timers = useRef<number[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  // Timers (upload, speech) must patch the latest draft, not the one from when they started.
  const latest = useRef(draft);
  latest.current = draft;
  const set = (patch: Partial<AudioBlock>) => onChange({ ...latest.current, ...patch });
  const mediaChanged = JSON.stringify(draft.media) !== JSON.stringify(original.media) && original.media !== null && draft.questions.length > 0;

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);
  const later = (ms: number, fn: () => void) => timers.current.push(window.setTimeout(fn, ms));

  const startUpload = (name: string, sizeMb: number) => {
    setUpload({ status: 'validating', name });
    later(500, () => {
      if (!OK_TYPES.test(name)) return setUpload({ status: 'invalid', name });
      if (sizeMb > MAX_MB) return setUpload({ status: 'tooLarge', name });
      [20, 55, 85].forEach((pct, i) => later(350 * (i + 1), () => setUpload({ status: 'uploading', name, pct })));
      later(1500, () => {
        if (rt.aiFails) return setUpload({ status: 'failed', name });
        setUpload({ status: 'ready', name });
        set({ media: { kind: 'upload', name, duration: 41 } });
      });
    });
  };

  const transcriptText = draft.transcript.map((l) => l.text.replace(/^—\s*/, '')).join(' ');
  const h = touch ? 'h-11' : 'h-8';
  const btn = `inline-flex items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:opacity-40 ${h}`;

  return (
    <div className="space-y-4">
      <TitleField value={draft.title} onChange={(title) => set({ title })} touch={touch} invalid={showErrors && !draft.title.trim()} />

      <SectionLabel>{bs.audio.source}</SectionLabel>
      <div className="flex items-center gap-2 rounded-lg bg-background-subtle px-3 py-2">
        <FileAudioIcon className="h-4 w-4 shrink-0 text-text-tertiary" aria-hidden="true" />
        <p className="min-w-0 flex-1 truncate text-sm text-text-primary">
          {draft.media ? (draft.media.kind === 'upload' ? bs.audio.uploaded(draft.media.name) : bs.audio.generated) : bs.counts.noRecording}
        </p>
        {draft.media && <span className="text-xs tabular-nums text-text-tertiary">{bs.time(draft.media.duration)}</span>}
      </div>

      <div className="flex flex-wrap gap-1">
        <input
          ref={fileRef}
          type="file"
          accept="audio/*,.mp3,.m4a,.wav,.ogg"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) startUpload(f.name, f.size / (1024 * 1024));
            e.target.value = '';
          }}
        />
        <button type="button" onClick={() => fileRef.current?.click()} className={`${btn} border border-border-strong text-text-primary hover:bg-background-subtle`}>
          <UploadIcon className="h-4 w-4" aria-hidden="true" />
          {draft.media ? bs.audio.replace : bs.audio.upload}
        </button>
        <button
          type="button"
          disabled={!draft.transcript.some((l) => l.text.trim()) || gen.status === 'generating'}
          onClick={() => {
            setGen({ status: 'generating' });
            later(1600, () => setGen(rt.aiFails ? { status: 'idle' } : { status: 'preview' }));
          }}
          className={`${btn} text-text-secondary hover:bg-background-subtle`}
        >
          {gen.status === 'generating' ? <Loader2Icon className="h-4 w-4 animate-spin" aria-hidden="true" /> : <SparklesIcon className="h-4 w-4" aria-hidden="true" />}
          {gen.status === 'generating' ? bs.audio.generating : bs.audio.generate}
        </button>
      </div>
      <p className="text-xs text-text-tertiary">
        {bs.audio.demoFiles}:{' '}
        {[
          [bs.audio.demoGood, 'dialogue-marche-v2.mp3', 1.8],
          [bs.audio.demoBig, 'cours-complet.wav', 61],
          [bs.audio.demoBad, 'notes.pdf', 0.2],
        ].map(([label, name, mb], i) => (
          <React.Fragment key={String(name)}>
            {i > 0 && ' · '}
            <button type="button" onClick={() => startUpload(String(name), Number(mb))} className="text-primary-default underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus">
              {label}
            </button>
          </React.Fragment>
        ))}
      </p>

      <div aria-live="polite" className="space-y-2">
        {upload.status === 'validating' && <Status icon="spin" text={bs.audio.validating} />}
        {upload.status === 'uploading' && <Status icon="spin" text={bs.audio.uploading(upload.pct)} />}
        {upload.status === 'ready' && <Status icon="ok" text={`${bs.audio.uploadReady} · ${upload.name}`} />}
        {(upload.status === 'invalid' || upload.status === 'tooLarge' || upload.status === 'failed') && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-danger-subtle px-3 py-2">
            <AlertCircleIcon className="h-4 w-4 shrink-0 text-danger-default" aria-hidden="true" />
            <p className="min-w-0 flex-1 text-sm text-text-primary">
              {upload.status === 'invalid' ? bs.audio.uploadInvalid : upload.status === 'tooLarge' ? bs.audio.uploadTooLarge : bs.audio.uploadFailed}
            </p>
            <button type="button" onClick={() => fileRef.current?.click()} className={`${btn} text-text-primary hover:bg-background-surface`}>
              {bs.audio.retry}
            </button>
          </div>
        )}
        {gen.status === 'preview' && (
          <div className="rounded-lg border border-primary-200 px-3 py-2">
            <p className="text-xs font-semibold text-text-primary">{bs.audio.generatedPreview}</p>
            <p className="text-xs text-text-tertiary">{bs.audio.generateNote}</p>
            <div className="mt-1.5 flex flex-wrap gap-1">
              <button type="button" onClick={() => rt.play('gen-preview', transcriptText)} className={`${btn} text-text-secondary hover:bg-background-subtle`}>
                {bs.audio.play}
              </button>
              <span className="flex-1" />
              <button type="button" onClick={() => setGen({ status: 'idle' })} className={`${btn} text-text-secondary hover:bg-background-subtle`}>
                {bs.audio.dismissGenerated}
              </button>
              <button
                type="button"
                onClick={() => {
                  set({ media: { kind: 'generated', name: 'speech.mp3', duration: Math.max(8, Math.round(transcriptText.length / 14)) } });
                  setGen({ status: 'idle' });
                }}
                className={`${btn} bg-primary-default text-background-surface hover:bg-primary-hover`}
              >
                {bs.audio.acceptGenerated}
              </button>
            </div>
          </div>
        )}
        {mediaChanged && (
          <p className="flex items-start gap-1.5 rounded-lg bg-warning-subtle px-3 py-2 text-sm text-text-primary">
            <AlertCircleIcon className="mt-0.5 h-4 w-4 shrink-0 text-warning-default" aria-hidden="true" />
            {bs.audio.staleQuestions}
          </p>
        )}
      </div>

      <SectionLabel>{bs.audio.transcript}</SectionLabel>
      <ol className="space-y-3">
        {draft.transcript.map((l, i) => (
          <li key={l.id} className="flex items-start gap-2">
            <div className="w-20 shrink-0">
              <Field
                id={`${l.id}-start`}
                label={bs.audio.start}
                value={l.start === undefined ? '' : String(l.start)}
                inputMode="numeric"
                touch={touch}
                onChange={(v) => set({ transcript: draft.transcript.map((x) => (x.id === l.id ? { ...x, start: v.trim() === '' || Number.isNaN(Number(v)) ? undefined : Number(v) } : x)) })}
              />
            </div>
            <div className="min-w-0 flex-1">
              <Field
                id={`${l.id}-text`}
                label={bs.audio.line(i + 1)}
                value={l.text}
                lang="fr"
                touch={touch}
                onChange={(text) => set({ transcript: draft.transcript.map((x) => (x.id === l.id ? { ...x, text } : x)) })}
              />
            </div>
            <span className="pt-5">
              <RemoveButton label={`${bs.grammar.remove} ${i + 1}`} touch={touch} onClick={() => set({ transcript: draft.transcript.filter((x) => x.id !== l.id) })} />
            </span>
          </li>
        ))}
      </ol>
      <AddButton label={bs.audio.addLine} touch={touch} onClick={() => set({ transcript: [...draft.transcript, { id: newId('t'), text: '' }] })} />

      <SectionLabel>{bs.audio.questions}</SectionLabel>
      <ExercisesEditor
        hideTitle
        draft={asExercises(draft)}
        original={asExercises(original)}
        touch={touch}
        showErrors={showErrors}
        onChange={(ex) => set({ questions: ex.items })}
      />
    </div>
  );
}

function Status({ icon, text }: { icon: 'spin' | 'ok'; text: string }) {
  return (
    <p className="flex items-center gap-1.5 text-sm text-text-secondary">
      {icon === 'spin' ? <Loader2Icon className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CheckCircle2Icon className="h-4 w-4 text-success-default" aria-hidden="true" />}
      {text}
    </p>
  );
}

