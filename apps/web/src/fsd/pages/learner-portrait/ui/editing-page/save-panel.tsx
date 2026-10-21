import { Save } from 'lucide-react';
import { useI18n } from '@/fsd/shared/i18n';
import { Button, InlineAlert } from '@/fsd/shared/ui';
import { portraitCopy } from '../../lib/copy';
import styles from '../common.module.css';

export function PortraitSavePanel({
    onSave,
    blocker,
    pending,
    error,
    errorReason,
    isUpdate,
    review,
    expiresAt,
}: {
    onSave(): void;
    blocker: string | null;
    pending: boolean;
    error: boolean;
    errorReason?: 'invalid' | 'resource' | 'generic';
    isUpdate: boolean;
    review: boolean;
    expiresAt?: string | undefined;
}) {
    const { locale, formatDate } = useI18n();
    let errorKey: 'actionError' | 'saveInvalid' | 'saveResource' =
        'actionError';
    if (errorReason === 'invalid') errorKey = 'saveInvalid';
    if (errorReason === 'resource') errorKey = 'saveResource';
    return (
        <div className={review ? styles.panel : styles.compactStack}>
            {review && (
                <>
                    <h2 className={styles.sectionTitle}>
                        {portraitCopy(locale, 'ready')}
                    </h2>
                    <ul className={styles.list}>
                        <li>{portraitCopy(locale, 'saveRemoves')}</li>
                        <li>
                            {portraitCopy(
                                locale,
                                isUpdate ? 'preservedUse' : 'separate',
                            )}
                        </li>
                        {expiresAt && (
                            <li>
                                {portraitCopy(locale, 'pendingBody')}{' '}
                                {formatDate(expiresAt)}
                            </li>
                        )}
                    </ul>
                </>
            )}
            {error && (
                <InlineAlert
                    tone='error'
                    actions={
                        <Button
                            size='compact'
                            onClick={onSave}
                            disabled={Boolean(blocker)}
                        >
                            {portraitCopy(locale, 'retry')}
                        </Button>
                    }
                >
                    {portraitCopy(locale, errorKey)}
                </InlineAlert>
            )}
            <div className={styles.desktopSave}>
                <Button
                    className={styles.saveButton}
                    fullWidth
                    onClick={onSave}
                    disabled={Boolean(blocker)}
                    loading={pending}
                    leadingIcon={<Save aria-hidden size={16} />}
                >
                    {portraitCopy(locale, 'save')}
                </Button>
                {blocker && <p className={styles.small}>{blocker}</p>}
                {!isUpdate && (
                    <p className={styles.small}>
                        {portraitCopy(locale, 'separate')}
                    </p>
                )}
            </div>
        </div>
    );
}

export function PortraitMobileSave({
    onSave,
    blocker,
    pending,
}: {
    onSave(): void;
    blocker: string | null;
    pending: boolean;
}) {
    const { locale } = useI18n();
    return (
        <div className={styles.mobileSave}>
            <a className={styles.summaryLink} href='#portrait-summary'>
                {blocker ?? portraitCopy(locale, 'summary')}
            </a>
            <Button
                className={styles.saveButton}
                onClick={onSave}
                disabled={Boolean(blocker)}
                loading={pending}
            >
                {portraitCopy(locale, 'save')}
            </Button>
        </div>
    );
}
