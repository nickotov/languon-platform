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
        <div
            role='status'
            aria-live='polite'
            className='rounded-xl border border-border-default bg-background-surface p-3'
        >
            <div className='flex flex-wrap items-center justify-between gap-2'>
                <p className='text-sm font-medium text-text-primary'>
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
                <p className='mt-1 text-xs text-text-secondary'>
                    {t('Work that already started may still use credits.')}
                </p>
            ) : null}
            <div
                className='mt-2 h-1 overflow-hidden rounded-full bg-progress-track'
                aria-hidden
            >
                <div
                    className={`h-full w-1/3 rounded-full bg-progress-fill ${styles.indeterminate}`}
                />
            </div>
            {checking ? (
                <p className='mt-1 text-[11px] text-text-tertiary'>
                    {t(
                        'Uses the AI preference chosen when this check started.',
                    )}
                </p>
            ) : null}
        </div>
    );
}
