import { useI18n } from '@/fsd/shared/i18n';
import { Button } from '@/fsd/shared/ui';
import { portraitCopy } from '../../../../../lib/copy';
import styles from '../../../../styles/common-common.module.css';

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
