import { Button } from '@/fsd/shared/ui';
import type { SentenceSessionController } from '../../types';
import { useSentenceCopy } from '../sentence-copy';
import styles from './sentence-job-status.module.css';

type Props = {
    job: SentenceSessionController['job'];
    onCancel(): void;
};

/** Source JobStatus presentation; the controller owns work and cancellation. */
export function SentenceJobStatus({ job, onCancel }: Props) {
    const { t } = useSentenceCopy();
    if (!job || !['queued', 'running'].includes(job.state)) return null;
    const checking = job.kind === 'sentence-check';
    const stopping = job.cancellationRequested;
    const title = t(
        stopping
            ? 'Stopping…'
            : checking
              ? 'Checking your answer'
              : 'Preparing a sentence',
    );
    return (
        <div role='status' aria-live='polite' className={styles.statusPanel}>
            <div className={styles.statusHeader}>
                <p className={styles.activity}>
                    {title}
                    {!stopping && job.state === 'queued'
                        ? ` — ${t('waiting to start')}`
                        : ''}
                </p>
                <Button
                    size='compact'
                    variant='secondary'
                    disabled={job.cancellationRequested}
                    onClick={onCancel}
                >
                    {t(
                        job.cancellationRequested
                            ? 'Stopping…'
                            : 'Stop request',
                    )}
                </Button>
            </div>
            {stopping ? (
                <p className={styles.reason}>
                    {t('Work that already started may still use credits.')}
                </p>
            ) : null}
            <div className={styles.track} aria-hidden>
                <div className={`${styles.fill} ${styles.indeterminate}`} />
            </div>
            {checking ? (
                <p className={styles.notice}>
                    {t(
                        'Uses the AI preference chosen when this check started.',
                    )}
                </p>
            ) : null}
        </div>
    );
}
