import { Button, InlineAlert } from '@/fsd/shared/ui';
import { useI18n } from '@/fsd/shared/i18n';
import { contentProposalLabels } from '../../../lib/content-proposal-labels';
import type { useInsertLessonCopy } from '../../../hooks/use-insert-lesson-copy';
import styles from './lesson-insert-notice.module.css';

export type LessonInsertFeedback = Pick<
    ReturnType<typeof useInsertLessonCopy>,
    | 'busy'
    | 'error'
    | 'wrongBranch'
    | 'isStale'
    | 'cursorUnavailable'
    | 'lessonInsertStatus'
    | 'canRefreshLessonDraft'
    | 'refreshLessonDraft'
>;

export function LessonInsertNotice({
    application,
}: {
    application: LessonInsertFeedback;
}) {
    const { locale } = useI18n();
    const labels = contentProposalLabels(locale);

    if (application.wrongBranch) {
        return (
            <InlineAlert tone='warning'>{labels.wrongLessonBranch}</InlineAlert>
        );
    }

    if (application.isStale) {
        const refresh = application.canRefreshLessonDraft && (
            <Button
                size='compact'
                variant='secondary'
                disabled={application.busy}
                onClick={application.refreshLessonDraft}
            >
                {labels.refreshDraft}
            </Button>
        );
        const message = application.canRefreshLessonDraft
            ? labels.refreshLessonBeforeInsert
            : labels.lessonChanged;

        return (
            <InlineAlert tone='warning' actions={refresh}>
                {message}
            </InlineAlert>
        );
    }

    if (application.cursorUnavailable) {
        return (
            <InlineAlert tone='warning'>{labels.cursorUnavailable}</InlineAlert>
        );
    }

    if (application.error) {
        return <InlineAlert tone='error'>{labels.error}</InlineAlert>;
    }

    return application.lessonInsertStatus ? (
        <p className={styles.feedback} role='status'>
            {labels.applied}
        </p>
    ) : null;
}
