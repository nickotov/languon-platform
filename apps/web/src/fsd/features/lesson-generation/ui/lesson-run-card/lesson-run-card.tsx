import {
    BookOpen,
    CheckCircle2,
    Square,
    Pencil,
    Play,
    Trash2,
} from 'lucide-react';
import type { GenerationRunSummary } from '@languon/contracts';
import { Button } from '@/fsd/shared/ui';
import { useI18n } from '@/fsd/shared/i18n';
import { failedLessonExercise } from '../../lib/failed-lesson-exercise';
import { LessonRunTaskList } from '../lesson-run-task-list/lesson-run-task-list';
import { lessonTaskStatus } from '../../lib/lesson-task-status';
import { lessonTaskUnitProgress } from '../../lib/lesson-task-unit-progress';
import { lessonRunNotice } from '../../lib/lesson-run-notice';
import { lessonRunCopy } from '../../lib/lesson-run-copy';
import styles from './lesson-run-card.module.css';

export function LessonRunCard({
    run,
    busy,
    stopping,
    reconnecting,
    continueBlocked = false,
    onContinue,
    onStop,
    onAdjust,
    onDiscard,
    onKeepSources,
    onRefreshSources,
    onPreview,
    children,
}: {
    run: GenerationRunSummary;
    busy: boolean;
    stopping: boolean;
    reconnecting: boolean;
    continueBlocked?: boolean;
    onContinue(): void;
    onStop(): void;
    onAdjust(): void;
    onDiscard(): void;
    onKeepSources(): void;
    onRefreshSources(): void;
    onPreview?: (() => void) | undefined;
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
    const sourceChanged = run.pauseReason === 'source-changed';
    const disabled = busy || reconnecting;
    const needsAdjustment =
        (run.failure?.code === 'admission-blocked' &&
            run.failure.admissionReason === 'context-too-large') ||
        (run.failure?.code === 'provider-rejected' &&
            run.failure.finishReason === 'content-filter');
    const current =
        run.tasks.find((task) => task.status === 'running') ??
        run.tasks.find(
            (task) => task.id === run.automation?.recoveringTaskId,
        ) ??
        run.tasks.find((task) => lessonTaskStatus(run, task) === 'failed');
    const currentExercise =
        current?.kind === 'exercises' &&
        current.completedUnitCount !== undefined &&
        current.totalUnitCount !== undefined &&
        current.completedUnitCount < current.totalUnitCount
            ? copy.exerciseOrdinal(
                  current.completedUnitCount + 1,
                  current.totalUnitCount,
              )
            : undefined;
    const partial = run.tasks.find(
        (task) =>
            task.status !== 'completed' && (task.completedUnitCount ?? 0) > 0,
    );
    const prepared = run.completedTaskCount > 0 || Boolean(partial);
    const progressTask = current ?? partial;
    const partialProgress = progressTask
        ? lessonTaskUnitProgress(progressTask, copy)
        : undefined;
    const automatic = run.automation?.enabled === true;
    const autoWaiting = paused && automatic;
    const retrying =
        run.pauseReason === 'technical-failure' ||
        run.pauseReason === 'interrupted';
    const failedExercise = failedLessonExercise(run);
    const exerciseLabel =
        failedExercise && !run.failure?.recoveryExhausted
            ? copy.failedExercise(failedExercise.index, failedExercise.total)
            : currentExercise;
    const uncertain =
        Boolean(run.uncertainTurnId) ||
        run.failure?.code === 'provider-outcome-unknown';
    const continueLabel = uncertain
        ? copy.authorizeAttempt
        : retrying
          ? failedExercise
              ? copy.retryExercise(failedExercise.index)
              : copy.retryRemaining
          : copy.continue;
    let title = copy.title;
    if (completed) {
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
                <BookOpen size={18} aria-hidden='true' />
                <h3>{title}</h3>
                {completed && <CheckCircle2 size={18} aria-hidden='true' />}
            </header>
            <div className={styles.body}>
                <p className={styles.progress} role='status'>
                    {progress}
                </p>
                {current && (
                    <p className={styles.current} dir='auto'>
                        {current.label}
                    </p>
                )}
                {partialProgress && (
                    <p className={styles.current}>{partialProgress}</p>
                )}
                {exerciseLabel && (
                    <p className={styles.current}>{exerciseLabel}</p>
                )}
                <p className={styles.notice} aria-live='polite'>
                    {notice}
                </p>
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
                    {paused && !autoWaiting && (
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
                {(running || autoWaiting) && (
                    <p className={styles.notice}>{copy.stopToAdjust}</p>
                )}
                {children}
                <details className={styles.details}>
                    <summary>{copy.details}</summary>
                    <LessonRunTaskList run={run} />
                    <p className={styles.notice}>
                        {stopping
                            ? copy.updating
                            : `${copy.charged}: ${run.chargedCredits}`}
                    </p>
                    {run.failure?.referenceId && (
                        <p className={styles.notice}>
                            {copy.failureReference}:{' '}
                            <code dir='ltr'>{run.failure.referenceId}</code>
                        </p>
                    )}
                    {paused && !autoWaiting && (
                        <Button
                            size='compact'
                            variant='ghost'
                            leadingIcon={
                                <Trash2 size={14} aria-hidden='true' />
                            }
                            onClick={onDiscard}
                            disabled={disabled}
                        >
                            {copy.discard}
                        </Button>
                    )}
                </details>
            </div>
        </article>
    );
}
