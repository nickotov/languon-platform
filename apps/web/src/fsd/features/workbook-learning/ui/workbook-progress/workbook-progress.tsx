import { Button, InlineAlert, LoadingState } from '@/fsd/shared/ui';
import {
    useWorkbookProgress,
    type WorkbookProgressOptions,
} from '../../hooks/use-workbook-progress';
import { learningLabels } from '../../lib/labels';
import styles from '../learning-progress/learning-progress.module.css';
export function WorkbookProgress(
    props: WorkbookProgressOptions & { locale: string },
) {
    const query = useWorkbookProgress(props);
    const labels = learningLabels(props.locale);
    function reload() {
        void query.refetch();
    }
    if (!props.actorId) return null;
    if (query.isPending) return <LoadingState>{labels.loading}</LoadingState>;
    if (query.isError)
        return (
            <InlineAlert
                tone='error'
                actions={<Button onClick={reload}>{labels.reload}</Button>}
            >
                {labels.loadError}
            </InlineAlert>
        );
    return (
        <section className={styles.panel} aria-label={labels.workbookProgress}>
            <p>{labels.private}</p>
            <p role='status'>
                {labels.completedNotes}: {query.data.completedNotes} /{' '}
                {query.data.totalNotes}
            </p>
            {query.data.updatedSinceCompletion > 0 && (
                <p>
                    {labels.updated}: {query.data.updatedSinceCompletion}
                </p>
            )}
        </section>
    );
}
