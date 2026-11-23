import { useState } from 'react';
import { ChevronDown, ListChecks, Trash2 } from 'lucide-react';
import type { GenerationRunSummary } from '@languon/contracts';
import { useI18n } from '@/fsd/shared/i18n';
import { Button } from '@/fsd/shared/ui';
import { lessonRunCopy } from '../../lib/lesson-run-copy';
import { lessonTaskStatus } from '../../lib/lesson-task-status';
import { lessonTaskUnitProgress } from '../../lib/lesson-task-unit-progress';
import { lessonExerciseOrdinal } from '../../lib/lesson-exercise-ordinal';
import { LessonRunTaskList } from '../lesson-run-task-list/lesson-run-task-list';
import styles from './lesson-run-plan.module.css';

export function LessonRunPlan({
    run,
    initiallyOpen,
    onDiscard,
    disabled,
}: {
    run: GenerationRunSummary;
    initiallyOpen: boolean;
    onDiscard: (() => void) | undefined;
    disabled: boolean;
}) {
    const { locale } = useI18n();
    const copy = lessonRunCopy(locale);
    const [expanded, setExpanded] = useState(initiallyOpen);
    const current =
        run.tasks.find((task) => task.status === 'running') ??
        run.tasks.find(
            (task) => task.id === run.automation?.recoveringTaskId,
        ) ??
        run.tasks.find((task) => lessonTaskStatus(run, task) === 'failed') ??
        run.tasks.find(
            (task) =>
                task.status !== 'completed' &&
                (task.completedUnitCount ?? 0) > 0,
        );
    const currentUnit =
        current &&
        (lessonExerciseOrdinal(run, current, copy) ??
            lessonTaskUnitProgress(current, copy));

    return (
        <details
            className={styles.plan}
            open={initiallyOpen}
            onToggle={(event) => setExpanded(event.currentTarget.open)}
        >
            <summary className={styles.summary}>
                <ListChecks size={16} aria-hidden />
                <span>{copy.details}</span>
                <ChevronDown className={styles.chevron} size={16} aria-hidden />
                {current && (
                    <span
                        className={styles.activitySlot}
                        aria-hidden={expanded}
                    >
                        <span className={styles.activity}>
                            <span dir='auto'>{current.label}</span>
                            {currentUnit && <small>{currentUnit}</small>}
                        </span>
                    </span>
                )}
            </summary>
            <div
                className={styles.body}
                inert={!expanded}
                aria-hidden={!expanded}
            >
                <LessonRunTaskList run={run} />
                {run.failure?.referenceId && (
                    <p className={styles.reference}>
                        {copy.failureReference}:{' '}
                        <code dir='ltr'>{run.failure.referenceId}</code>
                    </p>
                )}
                {onDiscard && (
                    <Button
                        size='compact'
                        variant='ghost'
                        leadingIcon={<Trash2 size={14} aria-hidden />}
                        onClick={onDiscard}
                        disabled={disabled}
                    >
                        {copy.discard}
                    </Button>
                )}
            </div>
        </details>
    );
}
