import { useI18n } from '@/fsd/shared/i18n';
import { Button, InlineAlert } from '@/fsd/shared/ui';

export function AutoSaveFeedback({
    existing,
    hasGeneratedContent,
    onRetry,
    status,
}: {
    existing: boolean;
    hasGeneratedContent: boolean;
    onRetry(): void;
    status:
        | 'idle'
        | 'saving'
        | 'saved'
        | 'failed'
        | 'invalid'
        | 'refreshFailed'
        | 'conflict'
        | 'unchanged';
}) {
    const { t } = useI18n();
    if (status === 'conflict') {
        return (
            <InlineAlert tone='warning'>
                {t('dictionary.conflict.help')}
            </InlineAlert>
        );
    }
    if (status === 'failed' || status === 'refreshFailed') {
        const refreshFailed = status === 'refreshFailed';
        const message = refreshFailed
            ? t('dictionary.card.ai.savedRefreshFailed')
            : t('dictionary.authoring.autoSaveFailed');
        const retryLabel = refreshFailed
            ? t('dictionary.authoring.retryRefresh')
            : t('dictionary.authoring.retrySave');
        return (
            <InlineAlert tone={refreshFailed ? 'warning' : 'danger'}>
                <p>{message}</p>
                <Button
                    onClick={onRetry}
                    size='compact'
                    type='button'
                    variant='secondary'
                >
                    {retryLabel}
                </Button>
            </InlineAlert>
        );
    }
    if (status === 'invalid') {
        return (
            <InlineAlert tone='warning'>
                {t('dictionary.authoring.candidateInvalid')}
            </InlineAlert>
        );
    }
    let message: string | null = null;
    if (status === 'saving') message = t('dictionary.authoring.autoSaving');
    else if (status === 'saved') message = t('dictionary.authoring.autoSaved');
    else if (status === 'unchanged')
        message = t('dictionary.authoring.noChanges');
    else if (!existing && hasGeneratedContent)
        message = t('dictionary.authoring.createRequired');
    if (!message) return null;
    return (
        <p aria-live='polite' role='status'>
            {message}
        </p>
    );
}
