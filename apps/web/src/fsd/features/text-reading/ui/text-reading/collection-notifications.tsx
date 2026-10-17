import { Button, ButtonLink, Toast } from '@/fsd/shared/ui';
import type { CollectController } from '../../hooks/use-collect';
import type { CollectionTask } from '../../hooks/use-collection-jobs';
import { useReadingCopy } from '../../hooks/use-reading-copy';
import { collectionFailureKey } from '../../lib/collection-failure';
import styles from './text-reading.module.css';

function CollectionNotification({
    c,
    task,
}: {
    c: CollectController;
    task: CollectionTask;
}) {
    const t = useReadingCopy();
    let variant: 'loading' | 'success' | 'error' = 'error';
    let titleKey: Parameters<typeof t>[0] = collectionFailureKey(
        task.failureCode,
    );
    if (task.state === 'adding') {
        variant = 'loading';
        titleKey = 'texts.collect.adding';
    } else if (task.state === 'success') {
        variant = 'success';
        titleKey = 'texts.collect.success';
    } else if (task.state === 'duplicate') {
        titleKey = 'texts.collect.duplicate';
    }
    const title = t(titleKey, { term: task.selection.text });
    const restoreLabel =
        task.state === 'duplicate'
            ? t('texts.collect.another')
            : t('texts.collect.retry');

    function dismiss() {
        c.dismissTask(task.body.operationId);
        if (c.selection === task.selection) c.close();
    }

    function cancel() {
        void c.cancelTask(task);
    }

    function restore() {
        c.restoreTask(task);
    }

    let action;
    if (task.state === 'success' && task.dictionaryId) {
        action = (
            <ButtonLink
                href={`/dictionaries/${task.dictionaryId}`}
                size='compact'
            >
                {t('texts.collect.open')}
            </ButtonLink>
        );
    } else if (task.state === 'adding') {
        action = (
            <Button
                size='compact'
                variant='ghost'
                disabled={!task.jobId}
                onClick={cancel}
            >
                {t('texts.collect.cancel')}
            </Button>
        );
    } else {
        action = (
            <Button size='compact' variant='ghost' onClick={restore}>
                {restoreLabel}
            </Button>
        );
    }

    return (
        <Toast
            open
            duration={null}
            variant={variant}
            dismissible={task.state !== 'adding'}
            dismissLabel={t('texts.collect.close')}
            onDismiss={dismiss}
            title={title}
            action={action}
        />
    );
}

export function CollectionNotifications({ c }: { c: CollectController }) {
    const t = useReadingCopy();

    return (
        <div
            className={styles.notifications}
            aria-label={t('texts.collect.add')}
        >
            {c.tasks.map((task) => (
                <CollectionNotification
                    key={task.body.operationId}
                    c={c}
                    task={task}
                />
            ))}
        </div>
    );
}
