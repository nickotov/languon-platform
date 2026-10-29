import React from 'react';
import { CheckCircle2Icon, ChevronDownIcon, CircleDashedIcon, LightbulbIcon, Loader2Icon, RotateCcwIcon, SparklesIcon, Volume2Icon, XCircleIcon } from 'lucide-react';
import { bs } from '../../../data/blockStrings';
import type { ExerciseAttempt, ExerciseItem } from '../../../types/blocks';
import { useBlockRuntime } from '../../../contexts/BlockRuntimeContext';
import { ru } from '../../../data/strings';

interface ExerciseItemViewProps {
  item: ExerciseItem;
  index: number;
}

function statusOf(a: ExerciseAttempt | undefined): { label: string; tone: 'muted' | 'success' | 'warning' | 'primary' } {
  if (!a || (!a.answer && !a.revealed && !a.hintUsed)) return { label: ru.exercise.unanswered, tone: 'muted' };
  if (a.result === 'correct') return { label: ru.exercise.correct, tone: 'success' };
  if (a.result === 'alternative') return { label: ru.exercise.alternative, tone: 'success' };
  if (a.result === 'revise') return { label: ru.exercise.revise, tone: 'warning' };
  if (a.submitted) return { label: ru.exercise.attempted, tone: 'primary' };
  if (a.revealed) return { label: ru.exercise.revealed, tone: 'muted' };
  if (a.answer) return { label: ru.exercise.draft, tone: 'muted' };
  return { label: ru.exercise.hintUsed, tone: 'muted' };
}

const toneClass = { muted: 'text-text-tertiary', success: 'text-success-default', warning: 'text-warning-default', primary: 'text-primary-default' };

/** Inline, collapsible practice item. Feedback, answers and hints appear directly below the task. */
export function ExerciseItemView({ item, index }: ExerciseItemViewProps) {
  const rt = useBlockRuntime();
  const raw = rt.attempts[item.id];
  const a = raw && raw.version === item.version ? raw : undefined;
  const open = rt.expanded[item.id] ?? false;
  const status = statusOf(a);
  const answer = a?.answer ?? '';
  const panelId = `ex-${item.id}`;
  const h = rt.touch ? 'h-11' : 'h-8';
  const btn = `inline-flex items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-40 ${h}`;

  return (
    <li className="py-1">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => rt.setExpanded([item.id], !open)}
        className={`flex w-full items-center gap-2 rounded-lg px-1 text-left hover:bg-background-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${rt.touch ? 'min-h-11' : 'min-h-9'}`}
      >
        <span className="w-5 shrink-0 text-xs font-medium text-text-tertiary">{index + 1}.</span>
        <span className={`min-w-0 flex-1 text-sm text-text-primary ${open ? '' : 'truncate'}`}>{open ? ru.exercise.kinds[item.kind] : item.prompt}</span>
        <span className={`shrink-0 text-xs font-medium ${toneClass[status.tone]}`}>{status.label}</span>
        <ChevronDownIcon className={`h-4 w-4 shrink-0 text-text-tertiary transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
        <span className="sr-only">{open ? ru.exercise.collapse : ru.exercise.expand}</span>
      </button>

      <div id={panelId} hidden={!open} className="pb-2 pl-8 pr-1 pt-1">
        <p lang={item.kind === 'free' ? undefined : 'fr'} className="text-base leading-7 text-text-primary">
          {item.prompt}
        </p>

        <div className="mt-2">
          {item.kind === 'choice' ? (
            <div role="radiogroup" aria-label={ru.exercise.answerLabel} className="flex flex-wrap gap-1.5">
              {item.choices?.map((c) => {
                const on = answer === c;
                return (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    lang="fr"
                    onClick={() => rt.setAnswer(item, c)}
                    className={`rounded-lg border px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${h} ${
                      on ? 'border-primary-default bg-primary-subtle font-medium text-primary-default' : 'border-border-default text-text-primary hover:bg-background-subtle'
                    }`}
                  >
                    {c}
                  </button>
                );
              })}
            </div>
          ) : item.kind === 'blank' ? (
            <input
              aria-label={ru.exercise.answerLabel}
              lang="fr"
              value={answer}
              onChange={(e) => rt.setAnswer(item, e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && rt.submit(item)}
              className={`w-40 rounded-lg border border-border-strong bg-background-surface px-3 text-sm text-text-primary focus:border-border-focus focus:outline-none focus:ring-2 focus:ring-primary-100 ${h}`}
            />
          ) : (
            <textarea
              aria-label={ru.exercise.answerLabel}
              lang="fr"
              rows={2}
              value={answer}
              onChange={(e) => rt.setAnswer(item, e.target.value)}
              className="w-full resize-y rounded-lg border border-border-strong bg-background-surface px-3 py-2 text-sm leading-6 text-text-primary focus:border-border-focus focus:outline-none focus:ring-2 focus:ring-primary-100"
            />
          )}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-1">
          {item.kind === 'free' ? (
            <button type="button" disabled={!answer.trim() || a?.checking} onClick={() => rt.checkWithAi(item)} className={`${btn} bg-primary-default text-background-surface hover:bg-primary-hover`}>
              {a?.checking ? <Loader2Icon className="h-4 w-4 animate-spin" aria-hidden="true" /> : <SparklesIcon className="h-4 w-4" aria-hidden="true" />}
              {a?.checking ? ru.exercise.checking : ru.exercise.checkAi}
            </button>
          ) : (
            <button type="button" disabled={!answer.trim()} onClick={() => rt.submit(item)} className={`${btn} bg-primary-default text-background-surface hover:bg-primary-hover`}>
              {ru.exercise.check}
            </button>
          )}
          {(item.hint || item.grounding) && (
            <button type="button" onClick={() => rt.useHint(item)} disabled={a?.hintUsed} className={`${btn} text-text-secondary hover:bg-background-subtle`}>
              <LightbulbIcon className="h-4 w-4" aria-hidden="true" />
              {ru.exercise.hint}
            </button>
          )}
          <button type="button" onClick={() => rt.reveal(item)} disabled={a?.revealed} className={`${btn} text-text-secondary hover:bg-background-subtle`}>
            {ru.exercise.showAnswer}
          </button>
          {a?.submitted && !a.checking && (
            <button type="button" onClick={() => rt.retry(item)} className={`${btn} text-text-secondary hover:bg-background-subtle`}>
              <RotateCcwIcon className="h-4 w-4" aria-hidden="true" />
              {ru.exercise.retry}
            </button>
          )}
        </div>

        <div aria-live="polite" className="space-y-2">
          {a?.result && (
            <div className={`mt-2 rounded-lg px-3 py-2 ${a.result === 'unavailable' ? 'bg-background-subtle' : a.result === 'revise' ? 'bg-warning-subtle' : 'bg-success-subtle'}`}>
              <p className="flex items-center gap-1.5 text-xs font-semibold text-text-primary">
                {a.result === 'revise' ? (
                  <XCircleIcon className="h-3.5 w-3.5 text-warning-default" aria-hidden="true" />
                ) : a.result === 'unavailable' ? (
                  <CircleDashedIcon className="h-3.5 w-3.5 text-text-tertiary" aria-hidden="true" />
                ) : (
                  <CheckCircle2Icon className="h-3.5 w-3.5 text-success-default" aria-hidden="true" />
                )}
                {item.kind === 'free' ? ru.exercise.aiFeedback : ru.exercise.check} ·{' '}
                {a.result === 'correct' ? ru.exercise.correct : a.result === 'alternative' ? ru.exercise.alternative : a.result === 'revise' ? ru.exercise.revise : ''}
              </p>
              <p className="mt-0.5 text-sm leading-6 text-text-primary">{a.result === 'unavailable' ? ru.exercise.checkFailed : a.feedback ?? (a.result === 'revise' ? item.explanation : '')}</p>
            </div>
          )}
          {a?.hintUsed && (item.hint || item.grounding) && (
            <div className="mt-2 border-l-2 border-warning-default pl-3">
              <p className="text-xs font-semibold text-text-secondary">{item.grounding ? bs.audio.hintPassage : ru.exercise.hintLabel}</p>
              {item.hint && <p className="text-sm leading-6 text-text-primary">{item.hint}</p>}
              {item.grounding && (
                <div className="flex flex-wrap items-center gap-x-2">
                  <p lang="fr" className="min-w-0 flex-1 text-sm italic leading-6 text-text-primary">
                    {item.grounding.passage}
                  </p>
                  {item.grounding.start !== undefined && (
                    <button
                      type="button"
                      onClick={() => {
                        const pid = `replay:${item.id}`;
                        if (rt.playing?.id === pid) rt.stop();
                        else rt.play(pid, item.grounding!.passage.replace(/^—\s*/, ''));
                      }}
                      aria-pressed={rt.playing?.id === `replay:${item.id}`}
                      className={`inline-flex items-center gap-1 rounded-md px-2 text-xs font-medium text-primary-default hover:bg-primary-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${rt.touch ? 'h-11' : 'h-7'}`}
                    >
                      <Volume2Icon className="h-3.5 w-3.5" aria-hidden="true" />
                      {bs.exercise.replay(bs.time(item.grounding.start))}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
          {a?.revealed && (
            <div className="mt-2 border-l-2 border-primary-default pl-3">
              <p className="text-xs font-semibold text-text-secondary">{ru.exercise.preparedAnswer}</p>
              <p lang="fr" className="text-sm font-medium leading-6 text-text-primary">
                {item.answer}
              </p>
              <p className="text-sm leading-6 text-text-secondary">{item.explanation}</p>
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

