import { Button, ButtonLink, Toast } from '@/fsd/shared/ui';
import type { CollectController } from '../../hooks/use-collect';
import { useReadingCopy } from '../../hooks/use-reading-copy';
import { collectionFailureKey } from '../../lib/collection-failure';
import styles from './text-reading.module.css';
export function CollectionNotifications({ c }: { c: CollectController }) {
    const t = useReadingCopy();
    return (
        <div
            className={styles.notifications}
            aria-label={t('texts.collect.add')}
        >
            {c.tasks.map((task) => (
                <Toast
                    key={task.body.operationId}
                    open
                    duration={null}
                    variant={
                        task.state === 'adding'
                            ? 'loading'
                            : task.state === 'success'
                              ? 'success'
                              : 'error'
                    }
                    dismissible={task.state !== 'adding'}
                    dismissLabel={t('texts.collect.close')}
                    onDismiss={() => {
                        c.dismissTask(task.body.operationId);
                        if (c.selection === task.selection) c.close();
                    }}
                    title={t(
                        task.state === 'adding'
                            ? 'texts.collect.adding'
                            : task.state === 'success'
                              ? 'texts.collect.success'
                              : task.state === 'duplicate'
                                ? 'texts.collect.duplicate'
                                : collectionFailureKey(task.failureCode),
                        { term: task.selection.text },
                    )}
                    action={
                        task.state === 'success' && task.dictionaryId ? (
                            <ButtonLink
                                href={`/dictionaries/${task.dictionaryId}`}
                                size='compact'
                            >
                                {t('texts.collect.open')}
                            </ButtonLink>
                        ) : task.state === 'adding' ? (
                            <Button
                                size='compact'
                                variant='ghost'
                                disabled={!task.jobId}
                                onClick={() => void c.cancelTask(task)}
                            >
                                {t('texts.collect.cancel')}
                            </Button>
                        ) : (
                            <Button
                                size='compact'
                                variant='ghost'
                                onClick={() => c.restoreTask(task)}
                            >
                                {t(
                                    task.state === 'duplicate'
                                        ? 'texts.collect.another'
                                        : 'texts.collect.retry',
                                )}
                            </Button>
                        )
                    }
                />
            ))}
        </div>
    );
}
