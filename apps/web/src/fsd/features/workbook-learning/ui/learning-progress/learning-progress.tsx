import { Button, InlineAlert, LoadingState } from '@/fsd/shared/ui';
import type { useWorkbookLearning } from '../../hooks/use-workbook-learning';
import styles from './learning-progress.module.css';

export function LearningProgress({
    model,
}: {
    model: ReturnType<typeof useWorkbookLearning>;
}) {
    const { labels, state } = model;
    if (!model.signedIn)
        return <p className={styles.notice}>{labels.signIn}</p>;
    if (model.query.isPending)
        return <LoadingState>{labels.loading}</LoadingState>;
    if (model.query.isError)
        return (
            <InlineAlert
                tone='error'
                actions={
                    <Button onClick={model.reload}>{labels.reload}</Button>
                }
            >
                {labels.loadError}
            </InlineAlert>
        );
    if (model.stale)
        return <InlineAlert tone='warning'>{labels.stale}</InlineAlert>;
    if (!state) return null;
    const completed = state.completion !== null;
    const action = completed ? labels.incomplete : labels.complete;
    return (
        <section className={styles.panel}>
            <p>{labels.private}</p>
            {completed && <p role='status'>{labels.completed}</p>}
            {state.updatedSinceCompletion && <p>{labels.updated}</p>}
            <div className={styles.actions}>
                <Button
                    variant='secondary'
                    onClick={model.complete}
                    loading={model.busy}
                >
                    {action}
                </Button>
                <Button variant='ghost' onClick={model.reload}>
                    {labels.reload}
                </Button>
            </div>
            <p>
                {labels.attempts}: {state.attempts.length} · {labels.events}:{' '}
                {state.events.length}
            </p>
            {state.truncated && <p>{labels.truncated}</p>}
            {model.hasError && (
                <InlineAlert
                    tone='error'
                    actions={
                        model.canRetry ? (
                            <Button disabled={model.busy} onClick={model.retry}>
                                {labels.retry}
                            </Button>
                        ) : undefined
                    }
                >
                    {labels.error}
                </InlineAlert>
            )}
        </section>
    );
}
