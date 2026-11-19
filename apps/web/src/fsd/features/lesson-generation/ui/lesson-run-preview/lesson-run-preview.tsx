import { useState, type KeyboardEvent } from 'react';
import { X } from 'lucide-react';
import type {
    GenerationRunPreview,
    GenerationRunSummary,
} from '@languon/contracts';
import {
    Button,
    Dialog,
    DialogActions,
    InlineAlert,
    LoadingState,
} from '@/fsd/shared/ui';
import { useI18n } from '@/fsd/shared/i18n';
import { lessonRunCopy } from '../../lib/lesson-run-copy';
import { preparedLessonBody } from '../../lib/prepared-lesson-body';
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
    const [expanded, setExpanded] = useState(false);
    const panelClass = expanded
        ? `${styles.panel} ${styles.expanded}`
        : styles.panel;
    const description = copy.progress(
        run.completedTaskCount,
        run.totalTaskCount,
    );
    const body = preview?.parts.length
        ? preparedLessonBody(run, preview, copy.previewPending)
        : undefined;

    function toggleExpanded() {
        setExpanded((value) => !value);
    }

    function containEscape(event: KeyboardEvent<HTMLDivElement>) {
        // Native cancel still closes this dialog; Escape must not stop the tutor behind it.
        if (open && event.key === 'Escape') {
            event.stopPropagation();
        }
    }

    return (
        <div className={styles.host} onKeyDown={containEscape}>
            <Dialog
                open={open}
                onClose={onClose}
                closeLabel={copy.close}
                title={copy.previewTitle}
                description={description}
                className={panelClass}
                headerClassName={styles.header}
                bodyClassName={styles.body}
                footerClassName={styles.footer}
                footer={
                    <DialogActions>
                        <Button
                            size='compact'
                            variant='ghost'
                            className={styles.expand}
                            onClick={toggleExpanded}
                        >
                            {expanded ? copy.collapse : copy.expand}
                        </Button>
                        <Button
                            size='compact'
                            variant='secondary'
                            onClick={onClose}
                            leadingIcon={<X size={14} aria-hidden='true' />}
                        >
                            {copy.close}
                        </Button>
                    </DialogActions>
                }
            >
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
                {body && renderBody(body, preview?.dependencies)}
                {!loading && !failed && !body && (
                    <p className={styles.note}>{copy.previewEmpty}</p>
                )}
            </Dialog>
        </div>
    );
}
