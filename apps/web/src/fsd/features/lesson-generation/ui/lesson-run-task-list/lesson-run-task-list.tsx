import { CheckCircle2, Circle, CircleAlert, LoaderCircle } from 'lucide-react';
import type { GenerationRunSummary } from '@languon/contracts';
import { useI18n } from '@/fsd/shared/i18n';
import { lessonRunCopy } from '../../lib/lesson-run-copy';
import { lessonTaskStatus } from '../../lib/lesson-task-status';
import { lessonTaskUnitProgress } from '../../lib/lesson-task-unit-progress';
import { lessonExerciseOrdinal } from '../../lib/lesson-exercise-ordinal';
import styles from './lesson-run-task-list.module.css';

export function LessonRunTaskList({ run }: { run: GenerationRunSummary }) {
    const { locale } = useI18n();
    const copy = lessonRunCopy(locale);
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
                const ordinal = lessonExerciseOrdinal(run, task, copy);
                const showStatus =
                    !ordinal && (!progress || status === 'failed');
                const Icon = icons[status];
                const current = run.state === 'running' && status === 'running';

                return (
                    <li
                        key={task.id}
                        className={styles.task}
                        aria-current={current ? 'step' : undefined}
                    >
                        <Icon
                            size={14}
                            aria-hidden='true'
                            className={styles.icon}
                        />
                        <span className={styles.label} dir='auto'>
                            {task.label}
                        </span>
                        <small
                            className={styles.status}
                            aria-live={current ? 'polite' : undefined}
                            aria-atomic={current || undefined}
                        >
                            {ordinal && <strong>{ordinal}</strong>}
                            {showStatus && <span>{statuses[status]}</span>}
                            {progress && <span>{progress}</span>}
                        </small>
                    </li>
                );
            })}
        </ol>
    );
}
