import {
    Check,
    CircleAlert,
    CloudAlert,
    CloudOff,
    LoaderCircle,
} from 'lucide-react';
import { useI18n } from '@/fsd/shared/i18n';
import {
    Button,
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/fsd/shared/ui';
import styles from './workspace-controls.module.css';

export function WorkspaceRecovery({
    status,
    savedAt,
    draft = false,
    dirty = false,
    saving = false,
    saveError = false,
    canSave = false,
    onRetry,
    onSave,
}: {
    savedAt?: string | undefined;
    status: 'saved' | 'saving' | 'unsaved' | 'error' | 'conflict';
    draft?: boolean;
    dirty?: boolean;
    saving?: boolean;
    saveError?: boolean;
    canSave?: boolean;
    onRetry(): void;
    onSave?(): void;
}) {
    const { t, locale } = useI18n();
    let label = t('knowledge.saved');
    let Icon = Check;
    let state = 'saved';
    if (draft) {
        label = t('knowledge.draft');
        state = 'draft';
    } else if (dirty) {
        label = t('knowledge.unsavedEdits');
        state = 'dirty';
    }
    if (saveError) {
        label = t('knowledge.saveFailed');
        Icon = CircleAlert;
        state = 'error';
    }
    if (saving) {
        label = t('knowledge.saving');
        Icon = LoaderCircle;
        state = 'saving';
    }
    if (state === 'saved' && savedAt) {
        const date = new Date(savedAt);
        if (Number.isFinite(date.getTime())) {
            const time = new Intl.DateTimeFormat(locale, {
                hour: '2-digit',
                minute: '2-digit',
                hourCycle: 'h23',
            }).format(date);
            label = `${label} · ${time}`;
        }
    }
    const recoveryLabel = t(`knowledge.recovery.${status}`);
    const recoveryIssue =
        status === 'error' || status === 'conflict' || status === 'unsaved';
    const RecoveryIcon = status === 'unsaved' ? CloudOff : CloudAlert;
    const showDot = state === 'draft' || state === 'dirty';
    const showSaveRetry = saveError && canSave && !!onSave;
    return (
        <div className={styles.statusCluster}>
            <Popover>
                <PopoverTrigger
                    className={styles.recovery}
                    aria-label={t('knowledge.recoveryDetails')}
                    title={label}
                    data-state={state}
                >
                    {showDot ? (
                        <span aria-hidden className={styles.statusDot} />
                    ) : (
                        <Icon
                            size={14}
                            aria-hidden
                            className={saving ? styles.spinning : undefined}
                        />
                    )}
                    <span role='status' className={styles.statusLabel}>
                        {label}
                    </span>
                    {recoveryIssue && (
                        <RecoveryIcon
                            size={14}
                            aria-label={recoveryLabel}
                            className={styles.recoveryWarning}
                        />
                    )}
                </PopoverTrigger>
                <PopoverContent
                    align='end'
                    className={styles.recoveryPanel}
                    aria-label={t('knowledge.recoveryDetails')}
                >
                    <strong>{t('knowledge.recoveryDetails')}</strong>
                    <p>{t('knowledge.recoveryHelp')}</p>
                    {saveError && (
                        <p className={styles.error}>
                            {t('knowledge.saveError')}
                        </p>
                    )}
                    <p role='status'>{recoveryLabel}</p>
                    {status === 'error' && (
                        <Button
                            size='compact'
                            variant='secondary'
                            onClick={onRetry}
                        >
                            {t('knowledge.retry')}
                        </Button>
                    )}
                </PopoverContent>
            </Popover>
            {showSaveRetry && (
                <button
                    type='button'
                    className={styles.retrySave}
                    onClick={onSave}
                >
                    {t('knowledge.retry')}
                </button>
            )}
        </div>
    );
}
