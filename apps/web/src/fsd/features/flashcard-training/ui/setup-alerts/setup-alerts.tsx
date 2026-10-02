import { useI18n } from '@/fsd/shared/i18n';
import { Button, InlineAlert } from '@/fsd/shared/ui';
import { orderFields } from '../../lib/flashcard-fields';
import type { useFlashcardSetup } from '../../hooks/use-flashcard-setup';
import { RetryButton } from '../retry-button/retry-button';

export function SetupAlerts({
    setup,
    activeCount,
    signedIn,
    onStart,
}: {
    setup: ReturnType<typeof useFlashcardSetup>;
    activeCount: number;
    signedIn: boolean;
    onStart(): void;
}) {
    const { t } = useI18n();
    let conflictSummary = '';
    if (setup.conflict) {
        const front = orderFields(setup.conflict.configuration.front)
            .map((field) => t(`training.field.${field}`))
            .join(', ');
        const back = orderFields(setup.conflict.configuration.back)
            .map((field) => t(`training.field.${field}`))
            .join(', ');
        const order = t(
            setup.conflict.shuffle
                ? 'training.shuffle'
                : 'training.dictionaryOrder',
        );
        conflictSummary = t('training.prefsConflictHelp', {
            front,
            back,
            order,
        });
    }
    return (
        <>
            {activeCount === 0 && (
                <InlineAlert title={t('training.empty')}>
                    {t('training.emptyHelp')}
                </InlineAlert>
            )}
            {!signedIn && (
                <InlineAlert title={t('training.sessionOnly')}>
                    {t('training.sessionOnlyHelp')}
                </InlineAlert>
            )}
            {setup.prefsStatus === 'error' && (
                <InlineAlert
                    tone='warning'
                    title={t('training.prefsFailed')}
                    actions={
                        <Button
                            variant='secondary'
                            size='compact'
                            onClick={setup.retryPrefs}
                        >
                            {t('training.reload')}
                        </Button>
                    }
                >
                    {t('training.prefsFailedHelp')}
                </InlineAlert>
            )}
            {setup.conflict && (
                <InlineAlert
                    tone='warning'
                    title={t('training.prefsConflict')}
                    actions={
                        <div className='flex flex-wrap gap-2'>
                            <Button
                                variant='secondary'
                                size='compact'
                                onClick={setup.reloadSaved}
                                disabled={setup.conflictBusy}
                            >
                                {t('training.reload')}
                            </Button>
                            <Button
                                size='compact'
                                onClick={setup.overwrite}
                                loading={setup.conflictBusy}
                            >
                                {t('training.overwrite')}
                            </Button>
                        </div>
                    }
                >
                    {conflictSummary}
                </InlineAlert>
            )}
            {setup.overwriteDone && (
                <InlineAlert tone='success' title={t('training.saved')}>
                    {t('training.overwriteDone')}
                </InlineAlert>
            )}
            {setup.startError && (
                <InlineAlert
                    tone='error'
                    title={t('training.error')}
                    actions={
                        <RetryButton
                            onRetry={onStart}
                            error={setup.startError}
                            disabled={!setup.canStart}
                        />
                    }
                >
                    {t('training.errorHelp')}
                </InlineAlert>
            )}
        </>
    );
}
