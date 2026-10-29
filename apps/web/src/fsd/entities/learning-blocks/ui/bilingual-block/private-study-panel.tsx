import { Lock, X } from 'lucide-react';
import { Button, IconButton } from '@/fsd/shared/ui';
import type { LearningPrivateStudy } from '../../types';
import styles from './bilingual-block.module.css';

export function PrivateStudyPanel({
    study,
    ready,
    language,
    onRemove,
}: {
    study: LearningPrivateStudy;
    ready: boolean;
    language: string;
    onRemove: () => void;
}) {
    const { labels } = study;
    const pendingLabel =
        study.pendingLanguage && study.pendingLanguage !== language
            ? ` (${study.languageNames?.[study.pendingLanguage] ?? study.pendingLanguage})`
            : '';
    const loading = study.state === 'loading';
    const busy = study.state === 'generating';
    const failed = study.state === 'failed';
    const unavailable = study.state === 'unavailable';
    let message = labels.notice;
    if (loading) message = labels.loading;
    if (busy) message = `${labels.generating}${pendingLabel}`;
    if (failed) message = `${labels.error}${pendingLabel}`;
    if (unavailable) message = labels.unavailable;
    return (
        <div className={styles.privatePanel} aria-live='polite'>
            <div className={styles.privateHeading}>
                <Lock size={14} aria-hidden='true' />
                <strong>{labels.title}</strong>
                <span className={styles.spacer} />
                {ready ? (
                    <IconButton
                        variant='ghost'
                        size='small'
                        label={labels.remove}
                        onClick={onRemove}
                        icon={<X size={14} />}
                    />
                ) : null}
            </div>
            <div className={styles.privateBody}>
                <p
                    className={
                        failed || unavailable
                            ? styles.privateError
                            : styles.privateNotice
                    }
                >
                    {message}
                </p>
                {!loading && !busy && !ready ? (
                    <Button
                        size='compact'
                        variant={failed || unavailable ? 'ghost' : 'primary'}
                        onClick={unavailable ? study.onRetry : study.onGenerate}
                    >
                        {failed || unavailable ? labels.retry : labels.generate}
                    </Button>
                ) : null}
                {busy && study.canCancel ? (
                    <Button
                        size='compact'
                        variant='ghost'
                        onClick={study.onCancel}
                    >
                        {labels.cancel}
                    </Button>
                ) : null}
            </div>
        </div>
    );
}
