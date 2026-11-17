import type {
    GenerationPlanRevisionCandidate,
    GenerationRunSummary,
} from '@languon/contracts';
import { Button } from '@/fsd/shared/ui';
import { useI18n } from '@/fsd/shared/i18n';
import { lessonRunCopy } from '../../lib/lesson-run-copy';
import styles from './lesson-run-revision.module.css';

export function LessonRunRevision({
    candidate,
    run,
    busy,
    onApply,
    onDismiss,
}: {
    candidate: GenerationPlanRevisionCandidate;
    run: GenerationRunSummary;
    busy: boolean;
    onApply(): void;
    onDismiss(): void;
}) {
    const { locale } = useI18n();
    const copy = lessonRunCopy(locale);
    const existing = new Map(run.tasks.map((task) => [task.id, task.label]));
    const proposed = new Map(
        candidate.plan.tasks.map((task) => [task.id, task.instruction]),
    );
    const changes = [
        { label: copy.kept, ids: candidate.keptTaskIds },
        { label: copy.changed, ids: candidate.changedTaskIds },
        { label: copy.added, ids: candidate.addedTaskIds },
        { label: copy.removed, ids: candidate.removedTaskIds },
    ].filter((change) => change.ids.length > 0);
    const stale = candidate.baseRevision !== run.revision;

    return (
        <section className={styles.revision} aria-label={copy.revision}>
            <h4>{copy.revision}</h4>
            <p>{copy.revisionNote}</p>
            <dl className={styles.changes}>
                {changes.map((change) => (
                    <div key={change.label}>
                        <dt>{change.label}</dt>
                        <dd>
                            <ul>
                                {change.ids.map((id) => (
                                    <li key={id} dir='auto'>
                                        {proposed.get(id) ??
                                            existing.get(id) ??
                                            copy.removed}
                                    </li>
                                ))}
                            </ul>
                        </dd>
                    </div>
                ))}
            </dl>
            <details>
                <summary>{copy.resultingOrder}</summary>
                <ol>
                    {candidate.plan.outputOrder.map((id) => (
                        <li key={id} dir='auto'>
                            {proposed.get(id)}
                        </li>
                    ))}
                </ol>
            </details>
            <p>{copy.applyNote}</p>
            {stale && <p role='status'>{copy.revisionStale}</p>}
            <div className={styles.actions}>
                <Button
                    size='compact'
                    onClick={onApply}
                    disabled={busy || stale}
                >
                    {copy.applyRevision}
                </Button>
                <Button
                    size='compact'
                    variant='ghost'
                    onClick={onDismiss}
                    disabled={busy}
                >
                    {copy.keepPlan}
                </Button>
            </div>
        </section>
    );
}
