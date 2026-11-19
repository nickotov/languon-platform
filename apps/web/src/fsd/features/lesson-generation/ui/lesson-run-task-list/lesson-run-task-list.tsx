import { CheckCircle2, Circle, CircleAlert, LoaderCircle } from 'lucide-react';
import type { GenerationRunSummary } from '@languon/contracts';
import { useI18n } from '@/fsd/shared/i18n';
import { lessonRunCopy } from '../../lib/lesson-run-copy';
import { lessonTaskStatus } from '../../lib/lesson-task-status';
import { lessonTaskUnitProgress } from '../../lib/lesson-task-unit-progress';
import { failedLessonExercise } from '../../lib/failed-lesson-exercise';
import styles from './lesson-run-task-list.module.css';

export function LessonRunTaskList({ run }: { run: GenerationRunSummary }) {
    const { locale } = useI18n();
    const copy = lessonRunCopy(locale);
    const failed = failedLessonExercise(run);
    const failedOrdinal = run.failure?.recoveryExhausted
        ? copy.exerciseOrdinal
        : copy.failedExercise;
    const statuses = {
        pending: copy.pending,
        running: copy.working,
        completed: copy.done,
        failed: run.failure?.recoveryExhausted
            ? copy.couldNotPrepare
            : copy.taskFailed,
    };
    const icons = {
        pending: Circle,
        running: LoaderCircle,
        completed: CheckCircle2,
        failed: CircleAlert,
    };

    return (
        <ol className={styles.tasks}>
            {run.tasks.map((task) => {
                const status = lessonTaskStatus(run, task);
                const progress = lessonTaskUnitProgress(task, copy);
                const failureLabel =
                    failed?.taskId === task.id
                        ? failedOrdinal(failed.index, failed.total)
                        : statuses.failed;
                const unitLabel =
                    status === 'failed'
                        ? failureLabel
                        : (progress ?? statuses[status]);
                const failureProgress =
                    status === 'failed' ? progress : undefined;
                const Icon = icons[status];

                return (
                    <li key={task.id}>
                        <Icon size={14} aria-hidden='true' />
                        <span dir='auto'>{task.label}</span>
                        <small>{unitLabel}</small>
                        {failureProgress && <small>{failureProgress}</small>}
                    </li>
                );
            })}
        </ol>
    );
}
