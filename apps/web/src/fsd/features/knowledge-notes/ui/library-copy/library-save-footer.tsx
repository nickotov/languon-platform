import { Button } from '@/fsd/shared/ui';
import type { LibraryLabels } from './library-labels';
import styles from './library-copy.module.css';

export function LibrarySaveFooter({
    labels,
    busy,
    saved,
    previewReady,
    previewDisabled,
    formId,
    onClose,
    onCommit,
}: {
    labels: LibraryLabels;
    busy: boolean;
    saved: boolean;
    previewReady: boolean;
    previewDisabled: boolean;
    formId: string;
    onClose: () => void;
    onCommit: () => void;
}) {
    if (saved)
        return (
            <div className={styles.footerActions}>
                <Button
                    type='button'
                    size='compact'
                    variant='ghost'
                    onClick={onClose}
                >
                    {labels.done}
                </Button>
            </div>
        );
    return (
        <div className={styles.footerActions}>
            <p className={styles.prepared}>{labels.prepared}</p>
            <Button
                type='button'
                size='compact'
                variant='ghost'
                onClick={onClose}
                disabled={busy}
            >
                {labels.cancel}
            </Button>
            {previewReady ? (
                <Button
                    type='button'
                    size='compact'
                    loading={busy}
                    onClick={onCommit}
                >
                    {labels.commit}
                </Button>
            ) : (
                <Button
                    type='submit'
                    form={formId}
                    size='compact'
                    loading={busy}
                    disabled={previewDisabled}
                >
                    {labels.preview}
                </Button>
            )}
        </div>
    );
}
