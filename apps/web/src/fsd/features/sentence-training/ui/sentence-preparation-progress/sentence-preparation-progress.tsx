'use client';
import styles from './sentence-preparation-progress.module.css';
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
        <div className={styles.progressContent}>
            {run ? (
                <p className={styles.languageMode}>
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
                <p role='status' className={styles.activity}>
                    <Loader2Icon aria-hidden className={styles.activityIcon} />
                    <span>
                        {activity}
                        {run?.state === 'stopping' ? (
                            <span className={styles.refundNote}>
                                {P('noRefund')}
                            </span>
                        ) : null}
                    </span>
                </p>
            ) : null}
            {controller.error && run && !hideDetails ? (
                <p className={styles.connectionNote}>
                    <WifiOffIcon
                        aria-hidden
                        className={styles.connectionIcon}
                    />
                    {P('slow')}
                </p>
            ) : null}
            {!hideDetails && run ? (
                <>
                    <div className={styles.coveragePanel}>
                        <p className={styles.coverageTitle} aria-live='polite'>
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
                        <div className={styles.counts}>
                            <span>
                                {P('reused', { n: run.reusedExerciseCount })}
                            </span>
                            <span>
                                {P('generated', {
                                    n: run.generatedExerciseCount,
                                })}
                            </span>
                        </div>
                        <p className={styles.countsNote}>{P('countsNote')}</p>
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
        <div className={styles.coverage}>
            <div className={styles.coverageHeader}>
                <span className={styles.coverageLabel}>{label}</span>
                <span className={styles.coverageValue}>{text}</span>
            </div>
            <div
                role='progressbar'
                aria-label={label}
                aria-valuemin={0}
                aria-valuemax={total}
                aria-valuenow={done}
                aria-valuetext={text}
                className={styles.track}
            >
                <div className={styles.fill} style={{ width: `${pct}%` }} />
            </div>
        </div>
    );
}
