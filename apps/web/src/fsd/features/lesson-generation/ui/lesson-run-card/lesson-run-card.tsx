import {
    BookOpen,
    AudioLines,
    CheckCircle2,
    Square,
    Pencil,
    Play,
    LoaderCircle,
} from 'lucide-react';
import type {
    ConversationActionQuote,
    GenerationRunSummary,
} from '@languon/contracts';
import { Button } from '@/fsd/shared/ui';
import { useI18n } from '@/fsd/shared/i18n';
import { failedLessonExercise } from '../../lib/failed-lesson-exercise';
import { LessonRunPlan } from '../lesson-run-plan/lesson-run-plan';
import { lessonRunNotice } from '../../lib/lesson-run-notice';
import { lessonRunCopy } from '../../lib/lesson-run-copy';
import styles from './lesson-run-card.module.css';
import {
    RecordingApproval,
    recordingApprovalCopy,
} from '../recording-approval/recording-approval';

export function LessonRunCard({
    run,
    busy,
    stopping,
    reconnecting,
    continueBlocked = false,
    recordingQuote,
    recordingPending = false,
    onRecordingDecision,
    onContinue,
    onStop,
    onAdjust,
    onDiscard,
    onKeepSources,
    onRefreshSources,
    onPreview,
    result,
    children,
}: {
    run: GenerationRunSummary;
    busy: boolean;
    stopping: boolean;
    reconnecting: boolean;
    continueBlocked?: boolean;
    onContinue(): void;
    recordingPending?: boolean;
    recordingQuote?: ConversationActionQuote | undefined;
    onRecordingDecision?(quoteId?: string): void;
    onStop(): void;
    onAdjust(): void;
    onDiscard(): void;
    onKeepSources(): void;
    onRefreshSources(): void;
    onPreview?: (() => void) | undefined;
    result?: React.ReactNode;
    children?: React.ReactNode;
}) {
    const { locale } = useI18n();
    const copy = lessonRunCopy(locale);
    if (run.state === 'discarded') {
        return null;
    }

    const running = run.state === 'running';
    const paused = run.state === 'paused';
    const completed = run.state === 'completed';
    const awaitingRecording =
        paused && run.pauseReason === 'recording-confirmation';
    const sourceChanged = run.pauseReason === 'source-changed';
    const disabled = busy || reconnecting;
    const needsAdjustment =
        (run.failure?.code === 'admission-blocked' &&
            (run.failure.admissionReason === 'context-too-large' ||
                run.failure.admissionReason === 'recording-too-long')) ||
        (run.failure?.code === 'provider-rejected' &&
            run.failure.finishReason === 'content-filter');
    const partial = run.tasks.find(
        (task) =>
            task.status !== 'completed' && (task.completedUnitCount ?? 0) > 0,
    );
    const prepared = run.completedTaskCount > 0 || Boolean(partial);
    const automatic = run.automation?.enabled === true;
    const autoWaiting = paused && automatic;
    const retrying =
        run.pauseReason === 'technical-failure' ||
        run.pauseReason === 'interrupted';
    const failedExercise = failedLessonExercise(run);
    const uncertain =
        Boolean(run.uncertainTurnId) ||
        run.failure?.code === 'provider-outcome-unknown';
    const needsBudgetReview =
        run.failure?.code === 'admission-blocked' &&
        run.failure.admissionReason === 'allowance-required';
    const continueLabel = uncertain
        ? copy.authorizeAttempt
        : needsBudgetReview
          ? copy.reviewBudget
          : retrying
            ? failedExercise
                ? copy.retryExercise(failedExercise.index)
                : copy.retryRemaining
            : copy.continue;
    let title = copy.title;
    if (awaitingRecording) {
        title = recordingApprovalCopy(locale).title;
    } else if (completed) {
        title = copy.complete;
    } else if (run.failure?.recoveryExhausted) {
        title = copy.planChangeNeeded;
    }

    const notice = lessonRunNotice(run, copy, stopping, reconnecting);

    const progress = copy.progress(run.completedTaskCount, run.totalTaskCount);

    return (
        <article
            className={styles.card}
            aria-label={title}
            data-lesson-run={run.id}
        >
            <header className={styles.header}>
                {running ? (
                    <LoaderCircle
                        className={styles.spinner}
                        size={18}
                        aria-hidden
                    />
                ) : awaitingRecording ? (
                    <AudioLines
                        className={styles.recordingIcon}
                        size={18}
                        aria-hidden
                    />
                ) : completed ? (
                    <CheckCircle2 size={18} aria-hidden />
                ) : (
                    <BookOpen size={18} aria-hidden />
                )}
                <h3>{title}</h3>
                {!awaitingRecording && (
                    <span className={styles.progress} role='status'>
                        {progress}
                    </span>
                )}
            </header>
            <div className={styles.body}>
                {awaitingRecording && (
                    <RecordingApproval
                        quote={recordingQuote ?? run.recordingApproval?.quote}
                        disabled={disabled || continueBlocked}
                        loading={recordingPending}
                        onDecision={onRecordingDecision}
                    />
                )}
                <LessonRunPlan
                    key={running || autoWaiting ? 'active' : 'idle'}
                    run={run}
                    initiallyOpen={running || autoWaiting}
                    onDiscard={paused && !autoWaiting ? onDiscard : undefined}
                    disabled={disabled}
                />
                {notice && !awaitingRecording && (
                    <p className={styles.notice} role='status'>
                        {notice}
                    </p>
                )}
                {reconnecting && run.pauseReason === 'technical-failure' && (
                    <p className={styles.notice}>{copy.reconnecting}</p>
                )}
                {run.uncertainTurnId &&
                    run.failure?.code !== 'provider-outcome-unknown' && (
                        <p className={styles.notice}>{copy.outcomeUnknown}</p>
                    )}
                {sourceChanged && (
                    <p className={styles.notice}>{copy.sourceNote}</p>
                )}
                <div className={styles.actions}>
                    {(running || autoWaiting) && (
                        <Button
                            size='compact'
                            variant='secondary'
                            leadingIcon={
                                <Square size={14} aria-hidden='true' />
                            }
                            onClick={onStop}
                            disabled={disabled || stopping}
                        >
                            {copy.stop}
                        </Button>
                    )}
                    {paused &&
                        !awaitingRecording &&
                        !sourceChanged &&
                        !autoWaiting &&
                        !run.failure?.recoveryExhausted && (
                            <Button
                                size='compact'
                                leadingIcon={
                                    <Play size={14} aria-hidden='true' />
                                }
                                onClick={onContinue}
                                disabled={
                                    disabled ||
                                    continueBlocked ||
                                    needsAdjustment ||
                                    (uncertain && !run.uncertainTurnId)
                                }
                            >
                                {continueLabel}
                            </Button>
                        )}
                    {prepared && onPreview && (
                        <Button
                            size='compact'
                            variant='secondary'
                            leadingIcon={
                                <BookOpen size={14} aria-hidden='true' />
                            }
                            onClick={onPreview}
                        >
                            {copy.preview}
                        </Button>
                    )}
                    {sourceChanged && (
                        <>
                            <Button
                                size='compact'
                                onClick={onKeepSources}
                                disabled={disabled}
                            >
                                {copy.keepSnapshot}
                            </Button>
                            <Button
                                size='compact'
                                variant='secondary'
                                onClick={onRefreshSources}
                                disabled={disabled}
                            >
                                {copy.refreshSources}
                            </Button>
                        </>
                    )}
                    {paused && !awaitingRecording && !autoWaiting && (
                        <Button
                            size='compact'
                            variant='secondary'
                            leadingIcon={
                                <Pencil size={14} aria-hidden='true' />
                            }
                            onClick={onAdjust}
                            disabled={
                                disabled || (uncertain && !run.uncertainTurnId)
                            }
                        >
                            {uncertain ? copy.authorizeAdjustment : copy.adjust}
                        </Button>
                    )}
                </div>
                {children}
            </div>
            {result && <div className={styles.result}>{result}</div>}
        </article>
    );
}
