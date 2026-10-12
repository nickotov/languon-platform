import styles from './end-session-dialog.module.css';
import { useI18n } from '@/fsd/shared/i18n';
import { Button, Dialog, DialogActions } from '@/fsd/shared/ui';

export function EndSessionDialog({
    open,
    signedIn,
    saving,
    onKeep,
    onEnd,
}: {
    open: boolean;
    signedIn: boolean;
    saving: boolean;
    onKeep(): void;
    onEnd(): void;
}) {
    const { t } = useI18n();

    const body = t(signedIn ? 'training.endSaved' : 'training.endAnonymous');

    const footer = (
        <DialogActions className={styles.actions}>
            <Button variant='secondary' onClick={onKeep}>
                {t('training.keep')}
            </Button>
            <Button onClick={onEnd}>{t('training.endSession')}</Button>
        </DialogActions>
    );

    return (
        <Dialog
            open={open}
            onClose={onKeep}
            title={t('training.endTitle')}
            closeLabel={t('training.close')}
            size='sm'
            dismissOnOverlayClick={false}
            footer={footer}
        >
            <div className={styles.body}>
                <p>
                    {body} {t('training.endQueue')}
                </p>
                {saving && (
                    <p className={styles.warning}>{t('training.endSaving')}</p>
                )}
            </div>
        </Dialog>
    );
}
