import React, { useEffect, useRef, useState } from 'react';
import { Loader2Icon, LockIcon, Volume2Icon, XIcon } from 'lucide-react';
import type { BilingualBlock, BlockVariant, TranslationLang } from '../../../types/blocks';
import { useBlockRuntime } from '../../../contexts/BlockRuntimeContext';
import { privateGerman } from '../../../data/blockSamples';
import { PlayButton } from '../PlayButton';
import { bs, langNames } from '../../../data/blockStrings';

interface BilingualViewProps {
  block: BilingualBlock;
  variant: BlockVariant;
  scope: string;
}

type PrivateState = { status: 'quoted' | 'generating' | 'ready' | 'failed'; lang: TranslationLang };

/** Language a reader can request privately in the prototype. */
const PRIVATE_LANG: TranslationLang = 'de';

/**
 * Original wording stays intact; translations are aligned per segment. Author-prepared languages are shared;
 * a signed-in reader can add a private overlay that only they see.
 */
export function BilingualView({ block, variant, scope }: BilingualViewProps) {
  const rt = useBlockRuntime();
  const [mode, setMode] = useState<'original' | 'bilingual'>('bilingual');
  const [lang, setLang] = useState<TranslationLang | 'private'>(block.prepared[0] ?? 'ru');
  const [priv, setPriv] = useState<PrivateState | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [wide, setWide] = useState(false);
  const timer = useRef(0);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWide(e.contentRect.width >= 560));
    ro.observe(el);
    return () => {
      ro.disconnect();
      window.clearTimeout(timer.current);
    };
  }, []);

  if (variant === 'compact' || variant === 'review') {
    const rows = variant === 'compact' ? block.segments.slice(0, 2) : block.segments;
    const langs = variant === 'compact' ? block.prepared.slice(0, 1) : block.prepared;
    return (
      <div ref={wrapRef} className="py-1">
        <p className="pb-1 text-xs text-text-tertiary">
          {bs.bilingual.prepared}: {block.prepared.map((l) => langNames[l]).join(', ')}
        </p>
        <ol className="divide-y divide-border-default">
          {rows.map((s) => (
            <li key={s.id} className="py-1.5">
              <p lang="fr" className="text-sm leading-6 text-text-primary">
                {s.source}
              </p>
              {langs.map((l) => (
                <p key={l} lang={l} className="text-sm leading-6 text-text-tertiary">
                  {variant === 'review' && <span className="mr-1 text-xs font-medium uppercase">{l}</span>}
                  {s.translations[l] ?? <em>{bs.bilingual.missing(langNames[l])}</em>}
                </p>
              ))}
            </li>
          ))}
        </ol>
        {variant === 'compact' && block.segments.length > rows.length && <p className="pt-1 text-xs text-text-tertiary">{bs.bilingual.more(block.segments.length - rows.length)}</p>}
      </div>
    );
  }

  const reader = rt.role !== 'author';
  const showingPrivate = lang === 'private' && priv?.status === 'ready';
  const translationOf = (id: string, i: number): string | undefined => {
    if (lang === 'private') return showingPrivate ? privateGerman[id] ?? undefined : undefined;
    return block.segments[i].translations[lang];
  };
  const missingPrepared = lang !== 'private' && block.segments.some((s) => !s.translations[lang]);

  const requestPrivate = () => {
    setPriv({ status: 'generating', lang: PRIVATE_LANG });
    const fails = rt.aiFails;
    timer.current = window.setTimeout(() => setPriv({ status: fails ? 'failed' : 'ready', lang: PRIVATE_LANG }), 1600);
  };

  const playingId = rt.playing?.id ?? '';
  const playingWhat = playingId === `${scope}:${block.id}:all` ? bs.bilingual.wholeText : (() => {
    const i = block.segments.findIndex((s) => playingId === `${scope}:${s.id}`);
    return i >= 0 ? bs.bilingual.sentence(i + 1) : null;
  })();

  const seg = (on: boolean) =>
    `rounded-md px-2.5 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${rt.touch ? 'h-10' : 'h-7'} ${
      on ? 'bg-background-surface text-text-primary shadow-sm' : 'text-text-secondary hover:text-text-primary'
    }`;
  const sideBySide = mode === 'bilingual' && wide;

  return (
    <div ref={wrapRef} className="py-1">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <div role="group" aria-label={bs.bilingual.viewLabel} className="inline-flex rounded-lg bg-background-subtle p-0.5">
          <button type="button" aria-pressed={mode === 'original'} onClick={() => setMode('original')} className={seg(mode === 'original')}>
            {bs.bilingual.original}
          </button>
          <button type="button" aria-pressed={mode === 'bilingual'} onClick={() => setMode('bilingual')} className={seg(mode === 'bilingual')}>
            {bs.bilingual.bilingual}
          </button>
        </div>
        {mode === 'bilingual' && (
          <label className="inline-flex items-center gap-1.5 text-xs text-text-secondary">
            <span>{bs.bilingual.language}</span>
            <select
              value={lang}
              onChange={(e) => setLang(e.target.value as TranslationLang | 'private')}
              className={`rounded-md border border-border-default bg-background-surface px-2 text-xs text-text-primary focus:border-border-focus focus:outline-none focus:ring-2 focus:ring-primary-100 ${rt.touch ? 'h-10' : 'h-7'}`}
            >
              {block.prepared.map((l) => (
                <option key={l} value={l}>
                  {langNames[l]}
                </option>
              ))}
              {reader && <option value="private">{`${langNames[PRIVATE_LANG]} · ${bs.bilingual.privateTitle.toLowerCase()}`}</option>}
            </select>
          </label>
        )}
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => (playingId === `${scope}:${block.id}:all` ? rt.stop() : rt.play(`${scope}:${block.id}:all`, block.segments.map((s) => s.source).join(' ')))}
          aria-pressed={playingId === `${scope}:${block.id}:all`}
          className={`inline-flex items-center gap-1.5 rounded-md px-2 text-xs font-medium text-text-secondary hover:bg-background-subtle hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${rt.touch ? 'h-10' : 'h-7'}`}
        >
          <Volume2Icon className="h-3.5 w-3.5" aria-hidden="true" />
          {bs.bilingual.playOriginal}
        </button>
      </div>

      <p className="min-h-0 text-xs text-primary-default" role="status" aria-live="polite">
        {playingWhat && rt.playing?.status === 'playing' ? bs.bilingual.playing(playingWhat) : ''}
      </p>

      {mode === 'bilingual' && lang === 'private' && (
        <PrivatePanel
          state={priv}
          anonymous={rt.role === 'anonymous'}
          touch={rt.touch}
          onQuote={() => setPriv({ status: 'quoted', lang: PRIVATE_LANG })}
          onConfirm={requestPrivate}
          onCancel={() => setPriv(null)}
          onRemove={() => {
            setPriv(null);
            setLang(block.prepared[0] ?? 'ru');
          }}
        />
      )}
      {mode === 'bilingual' && missingPrepared && <p className="mb-2 text-xs text-warning-default">{bs.bilingual.missing(langNames[lang as TranslationLang])}</p>}

      <ol className="space-y-3">
        {block.segments.map((s, i) => {
          const tr = mode === 'bilingual' ? translationOf(s.id, i) : undefined;
          return (
            <li key={s.id} className={sideBySide ? 'grid grid-cols-2 gap-6' : ''}>
              <div className="flex items-start gap-1.5">
                <p lang="fr" className="min-w-0 flex-1 text-base leading-7 text-text-primary">
                  {s.source}
                </p>
                <PlayButton id={`${scope}:${s.id}`} text={s.source} label={bs.bilingual.playSegment(i + 1)} />
              </div>
              {tr && (
                <p lang={lang === 'private' ? PRIVATE_LANG : lang} className={`text-base leading-7 ${showingPrivate ? 'text-primary-default' : 'text-text-tertiary'} ${sideBySide ? '' : 'mt-0.5'}`}>
                  {tr}
                </p>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

interface PrivatePanelProps {
  state: PrivateState | null;
  anonymous: boolean;
  touch: boolean;
  onQuote: () => void;
  onConfirm: () => void;
  onCancel: () => void;
  onRemove: () => void;
}

function PrivatePanel({ state, anonymous, touch, onQuote, onConfirm, onCancel, onRemove }: PrivatePanelProps) {
  const lang = langNames[PRIVATE_LANG];
  const h = touch ? 'h-10' : 'h-7';
  const btn = `inline-flex items-center gap-1.5 rounded-md px-2.5 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${h}`;
  return (
    <div className="mb-3 rounded-lg bg-primary-subtle px-3 py-2" aria-live="polite">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-text-primary">
        <LockIcon className="h-3.5 w-3.5 text-primary-default" aria-hidden="true" />
        {state?.status === 'ready' ? bs.bilingual.privateReady(lang) : bs.bilingual.privateTitle}
        {state?.status === 'ready' && (
          <button type="button" onClick={onRemove} aria-label={bs.bilingual.remove} className="ml-auto inline-flex h-6 w-6 items-center justify-center rounded text-text-tertiary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus">
            <XIcon className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}
      </p>
      {anonymous ? (
        <p className="mt-0.5 text-xs text-text-secondary">{bs.bilingual.privateSignIn}</p>
      ) : !state ? (
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <p className="min-w-0 flex-1 text-xs text-text-secondary">{bs.bilingual.privateNote}</p>
          <button type="button" onClick={onQuote} className={`${btn} bg-primary-default text-background-surface hover:bg-primary-hover`}>
            {bs.bilingual.privateAction(lang)}
          </button>
        </div>
      ) : state.status === 'quoted' ? (
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <p className="min-w-0 flex-1 text-xs text-text-secondary">{bs.bilingual.privateQuote(lang)}</p>
          <button type="button" onClick={onCancel} className={`${btn} text-text-secondary hover:bg-background-surface`}>
            {bs.bilingual.privateCancel}
          </button>
          <button type="button" onClick={onConfirm} className={`${btn} bg-primary-default text-background-surface hover:bg-primary-hover`}>
            {bs.bilingual.privateConfirm}
          </button>
        </div>
      ) : state.status === 'generating' ? (
        <p className="mt-0.5 inline-flex items-center gap-1.5 text-xs text-text-secondary">
          <Loader2Icon className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          {bs.bilingual.privateGenerating(lang)}
        </p>
      ) : state.status === 'failed' ? (
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <p className="min-w-0 flex-1 text-xs text-danger-default">{bs.bilingual.privateFailed}</p>
          <button type="button" onClick={onConfirm} className={`${btn} text-text-primary hover:bg-background-surface`}>
            {bs.bilingual.privateRetry}
          </button>
        </div>
      ) : (
        <p className="mt-0.5 text-xs text-text-secondary">{bs.bilingual.privateNote}</p>
      )}
    </div>
  );
}

