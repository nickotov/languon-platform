import type {
    GenerationRunPreview,
    GenerationRunSummary,
} from '@languon/contracts';
import { Button, PanelPage, InlineAlert, LoadingState } from '@/fsd/shared/ui';
import { useI18n } from '@/fsd/shared/i18n';
import { lessonRunCopy } from '../../lib/lesson-run-copy';
import { preparedLessonSections } from '../../lib/prepared-lesson-sections';
import type { PreparedLessonRenderer } from '../../types';
import styles from './lesson-run-preview.module.css';

export function LessonRunPreview({
    run,
    preview,
    open,
    loading,
    failed,
    accessDenied = false,
    onClose,
    onRetry,
    renderBody,
}: {
    run: GenerationRunSummary;
    preview: GenerationRunPreview | undefined;
    open: boolean;
    loading: boolean;
    failed: boolean;
    accessDenied?: boolean | undefined;
    onClose(): void;
    onRetry(): void;
    renderBody: PreparedLessonRenderer;
}) {
    const { locale } = useI18n();
    const copy = lessonRunCopy(locale);
    if (!open) {
        return null;
    }

    const sections = preview?.parts.length
        ? preparedLessonSections(run, preview)
        : undefined;

    return (
        <PanelPage
            title={copy.previewTitle}
            backLabel={copy.backToChat}
            onBack={onClose}
        >
            <p className={styles.note}>
                {copy.progress(run.completedTaskCount, run.totalTaskCount)}
            </p>
            <p className={styles.note}>{copy.previewNote}</p>
            {loading && !preview && (
                <LoadingState>{copy.previewLoading}</LoadingState>
            )}
            {failed && (
                <InlineAlert tone='warning'>
                    {accessDenied ? copy.previewDenied : copy.previewError}
                    {!accessDenied && (
                        <Button
                            size='compact'
                            variant='ghost'
                            onClick={onRetry}
                        >
                            {copy.previewRetry}
                        </Button>
                    )}
                </InlineAlert>
            )}
            {sections?.map(({ task, part, dependencies }) => (
                <section className={styles.part} key={task.id}>
                    <h2 dir='auto'>{task.label}</h2>
                    {part && renderBody(part.body, dependencies)}
                    {!part?.complete && (
                        <p className={styles.pending}>{copy.previewPending}</p>
                    )}
                </section>
            ))}
            {!loading && !failed && !sections && (
                <p className={styles.note}>{copy.previewEmpty}</p>
            )}
        </PanelPage>
    );
}
