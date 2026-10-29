import { useI18n } from '@/fsd/shared/i18n';
import { Button, InlineAlert } from '@/fsd/shared/ui';
import styles from './workspace-notices.module.css';

export function WorkspaceNotices({
    alternatives,
    recoveryError,
    actionError,
    retargeting,
    onRetryRecovery,
    onCancelRetarget,
    onApplyRetarget,
}: {
    alternatives: boolean;
    recoveryError: boolean;
    actionError: boolean;
    retargeting: boolean;
    onRetryRecovery(): void;
    onCancelRetarget(): void;
    onApplyRetarget(): void;
}) {
    const { t } = useI18n();
    if (!alternatives && !recoveryError && !actionError && !retargeting)
        return null;
    const retry = (
        <Button onClick={onRetryRecovery}>{t('knowledge.retry')}</Button>
    );
    const retargetActions = (
        <div className={styles.actions}>
            <Button variant='secondary' onClick={onCancelRetarget}>
                {t('knowledge.cancel')}
            </Button>
            <Button onClick={onApplyRetarget}>
                {t('knowledge.applyNewTarget')}
            </Button>
        </div>
    );
    return (
        <div className={styles.root}>
            {alternatives && (
                <InlineAlert tone='warning'>
                    {t('knowledge.resolveBeforeSave')}
                </InlineAlert>
            )}
            {recoveryError && (
                <InlineAlert tone='error' actions={retry}>
                    {t('knowledge.recoveryError')}
                </InlineAlert>
            )}
            {actionError && (
                <InlineAlert tone='error'>
                    {t('knowledge.saveError')}
                </InlineAlert>
            )}
            {retargeting && (
                <InlineAlert tone='warning' actions={retargetActions}>
                    {t('knowledge.retargetHelp')}
                </InlineAlert>
            )}
        </div>
    );
}
