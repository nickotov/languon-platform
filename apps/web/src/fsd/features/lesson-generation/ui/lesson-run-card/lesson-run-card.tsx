import {
    BookOpen,
    CheckCircle2,
    Circle,
    LoaderCircle,
    Square,
    Pencil,
    Play,
    Trash2,
} from 'lucide-react';
import type { GenerationRunSummary } from '@languon/contracts';
import { Button } from '@/fsd/shared/ui';
import { useI18n } from '@/fsd/shared/i18n';
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
    const current = run.tasks.find((task) => task.status === 'running');
    const title = completed ? copy.complete : copy.title;
    let notice = copy.running;
    if (run.pauseReason === 'budget') {
        notice = copy.budget;
    }

    if (run.pauseReason === 'technical-failure') {
        notice = copy.failed;
    }

    if (run.pauseReason === 'interrupted') {
        notice = copy.interrupted;
    }

    if (run.pauseReason === 'stopped') {
        notice = copy.stopped;
    }

    if (sourceChanged) {
        notice = copy.sourceChanged;
    }

    if (completed) {
        notice = copy.ready;
    }

    if (stopping) {
        notice = copy.stopping;
    }

    if (reconnecting) {
        notice = copy.reconnecting;
    }

    const statuses = {
        pending: copy.pending,
        running: copy.working,
        completed: copy.done,
        failed: copy.taskFailed,
    };
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
                <p className={styles.notice} aria-live='polite'>
                    {notice}
                </p>
                {sourceChanged && (
                    <p className={styles.notice}>{copy.sourceNote}</p>
                )}
                <div className={styles.actions}>
                    {running && (
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
                    {paused && !sourceChanged && (
                        <Button
                            size='compact'
                            leadingIcon={<Play size={14} aria-hidden='true' />}
                            onClick={onContinue}
                            disabled={disabled || continueBlocked}
                        >
                            {copy.continue}
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
                    {paused && (
                        <Button
                            size='compact'
                            variant='secondary'
                            leadingIcon={
                                <Pencil size={14} aria-hidden='true' />
                            }
                            onClick={onAdjust}
                            disabled={disabled}
                        >
                            {copy.adjust}
                        </Button>
                    )}
                </div>
                {running && (
                    <p className={styles.notice}>{copy.stopToAdjust}</p>
                )}
                {children}
                <details className={styles.details}>
                    <summary>{copy.details}</summary>
                    <ol className={styles.tasks}>
                        {run.tasks.map((task) => {
                            let Icon = Circle;
                            if (task.status === 'completed') {
                                Icon = CheckCircle2;
                            }

                            if (task.status === 'running') {
                                Icon = LoaderCircle;
                            }

                            return (
                                <li key={task.id}>
                                    <Icon size={14} aria-hidden='true' />
                                    <span dir='auto'>{task.label}</span>
                                    <small>{statuses[task.status]}</small>
                                </li>
                            );
                        })}
                    </ol>
                    <p className={styles.notice}>
                        {stopping
                            ? copy.updating
                            : `${copy.charged}: ${run.chargedCredits}`}
                    </p>
                    {paused && (
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
