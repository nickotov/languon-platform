'use client';
import { Loader2Icon, WifiOffIcon } from 'lucide-react';
import type { SentencePreparationBatch } from '@languon/contracts';
import type { SentencePreparationController } from '../../types';
import { useSentenceCopy } from '../sentence-copy';
import { usePreparationCopy } from '../sentence-preparation-copy';
import { SentencePreparationNotice } from '../sentence-preparation-notice/sentence-preparation-notice';
import { SentencePreparationRounds } from '../sentence-preparation-rounds/sentence-preparation-rounds';

export function SentencePreparationProgress({
    controller,
    sourceLanguage,
    targetLanguage,
    onStartRound,
    onStartAgain,
    onOpenLibrary,
    onOpenAiSettings,
}: {
    controller: SentencePreparationController;
    sourceLanguage: string;
    targetLanguage: string;
    onStartRound(batch: SentencePreparationBatch): void;
    onStartAgain(): void;
    onOpenLibrary?: (() => void) | undefined;
    onOpenAiSettings?: (() => void) | undefined;
}) {
    const { P } = usePreparationCopy();
    const { languageName } = useSentenceCopy();
    const run = controller.preparation;
    const forward = run?.direction === 'source-to-target';
    const read = forward ? sourceLanguage : targetLanguage;
    const answer = forward ? targetLanguage : sourceLanguage;
    const first = controller.batches[0];
    const hideDetails =
        !run || run.pauseReason === 'stale' || run.pauseReason === 'access';
    const mode =
        run?.mode === 'new-only'
            ? P('nameNew')
            : run?.mode === 'review-only'
              ? P('nameReview')
              : P('nameSavedFirst');
    const activity =
        !run && controller.busy
            ? P('submittingTitle')
            : run?.state === 'queued'
              ? P('queued')
              : run?.state === 'running'
                ? run.activeJobId
                    ? P('generating')
                    : P('reusing')
                : run?.state === 'stopping'
                  ? P('stopping')
                  : null;
    return (
        <div className='space-y-4'>
            {run ? (
                <p className='text-sm text-text-secondary'>
                    {languageName(read)} → {languageName(answer)} · {mode}
                </p>
            ) : null}
            <SentencePreparationNotice
                controller={controller}
                onStartAgain={onStartAgain}
                onOpenLibrary={onOpenLibrary}
                onOpenAiSettings={onOpenAiSettings}
            />
            {activity ? (
                <p
                    role='status'
                    className='flex items-start gap-2 text-sm text-text-primary'
                >
                    <Loader2Icon
                        aria-hidden
                        className='mt-0.5 h-4 w-4 shrink-0 animate-spin text-primary-default motion-reduce:animate-none'
                    />
                    <span>
                        {activity}
                        {run?.state === 'stopping' ? (
                            <span className='block text-xs text-text-secondary'>
                                {P('noRefund')}
                            </span>
                        ) : null}
                    </span>
                </p>
            ) : null}
            {controller.error && run && !hideDetails ? (
                <p className='flex items-center gap-2 rounded-lg bg-background-subtle p-2 text-xs text-text-secondary'>
                    <WifiOffIcon aria-hidden className='h-3.5 w-3.5' />
                    {P('slow')}
                </p>
            ) : null}
            {!hideDetails && run ? (
                <>
                    <div className='space-y-3 rounded-xl border border-border-default bg-background-subtle p-3'>
                        <p
                            className='text-lg font-semibold text-text-primary'
                            aria-live='polite'
                        >
                            {P('readyWords', {
                                done: run.preparedCount,
                                total: run.eligibleCount,
                            })}
                        </p>
                        <CoverageBar
                            label={P('overall')}
                            done={run.preparedCount}
                            total={run.eligibleCount}
                        />
                        {first ? (
                            <CoverageBar
                                label={P('firstRound')}
                                done={first.preparedEntryIds.length}
                                total={first.entryIds.length}
                            />
                        ) : null}
                        <div className='flex flex-wrap gap-x-4 gap-y-1 text-sm text-text-primary'>
                            <span>
                                {P('reused', { n: run.reusedExerciseCount })}
                            </span>
                            <span>
                                {P('generated', {
                                    n: run.generatedExerciseCount,
                                })}
                            </span>
                        </div>
                        <p className='text-xs text-text-secondary'>
                            {P('countsNote')}
                        </p>
                    </div>
                    <SentencePreparationRounds
                        controller={controller}
                        onStartRound={onStartRound}
                        startDisabled={
                            controller.uncertain || !!controller.error
                        }
                    />
                </>
            ) : null}
        </div>
    );
}
function CoverageBar({
    label,
    done,
    total,
}: {
    label: string;
    done: number;
    total: number;
}) {
    const { P } = usePreparationCopy();
    const pct = total ? Math.min(100, Math.round((done / total) * 100)) : 0;
    const text = P('coverageBar', { done, total });
    return (
        <div className='space-y-1'>
            <div className='flex items-center justify-between gap-2 text-xs'>
                <span className='font-medium text-text-primary'>{label}</span>
                <span className='text-text-secondary'>{text}</span>
            </div>
            <div
                role='progressbar'
                aria-label={label}
                aria-valuemin={0}
                aria-valuemax={total}
                aria-valuenow={done}
                aria-valuetext={text}
                className='h-2 overflow-hidden rounded-full bg-progress-track'
            >
                <div
                    className='h-full rounded-full bg-progress-fill transition-[width] duration-300 motion-reduce:transition-none'
                    style={{ width: `${pct}%` }}
                />
            </div>
        </div>
    );
}
