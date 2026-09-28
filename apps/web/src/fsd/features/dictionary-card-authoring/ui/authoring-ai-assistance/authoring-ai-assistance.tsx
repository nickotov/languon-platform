import { CheckCheck, Info, RefreshCw, Sparkles, X } from 'lucide-react';
import { useI18n } from '@/fsd/shared/i18n';
import { Button, InlineAlert } from '@/fsd/shared/ui';
import type { DictionaryCardAuthoringAI } from '../../types';
import styles from './authoring-ai-assistance.module.css';

function authoringStageKey(job: DictionaryCardAuthoringAI['job']) {
    if (job?.progress.stage === 'queued') {
        return 'dictionary.authoring.stage.queued';
    }

    if (job?.progress.stage === 'validating') {
        return 'dictionary.authoring.stage.validating';
    }

    return 'dictionary.authoring.stage.generating';
}

export function AuthoringAiAssistance({
    ai,
    active,
    stale,
    validSource,
    canGenerate,
    generateAll,
    acceptAllSuggestions,
    availableSuggestionCount,
    availableSuggestionFieldCount,
    bulkAcceptSuggestionCount,
    discardAllSuggestions,
}: {
    ai: DictionaryCardAuthoringAI;
    active: boolean;
    stale: boolean;
    validSource: boolean;
    canGenerate: boolean;
    generateAll(): void;
    acceptAllSuggestions(): void;
    availableSuggestionCount: number;
    availableSuggestionFieldCount: number;
    bulkAcceptSuggestionCount: number;
    discardAllSuggestions(): void;
}) {
    const { t } = useI18n();
    const legacyReview =
        ai.format === 'card-authoring:v1' && Boolean(ai.proposal);
    const disabled =
        !validSource ||
        !ai.available ||
        !canGenerate ||
        active ||
        ai.pending ||
        legacyReview;
    const regenerateDisabled = disabled || stale;
    const loading = ai.pending && !active;
    const job = ai.job;
    const showRegenerate = Boolean(ai.proposal);
    const hasJob = job !== null && job !== undefined;
    const isActiveJob = active && hasJob;
    const isSourceMissing = !validSource;
    const isUnavailable = !ai.available;
    const isExpired = job?.state === 'expired';
    const hasError = Boolean(ai.error);
    const hasAvailableSuggestions = availableSuggestionCount > 0;
    const acceptAllDisabled =
        stale || active || ai.pending || bulkAcceptSuggestionCount === 0;
    const stageKey = authoringStageKey(job);
    const labels = {
        aiSection: t('dictionary.authoring.aiSection'),
        expired: t('dictionary.authoring.expired'),
        generate: t('dictionary.authoring.generate'),
        generateHelp: t('dictionary.authoring.generateHelp'),
        regenerateAll: t('dictionary.authoring.regenerateAll'),
        sourceRequired: t('dictionary.authoring.sourceRequired'),
        stage: t(stageKey),
        unavailable: t('dictionary.authoring.unavailable'),
        acceptAll: t('dictionary.authoring.acceptAll'),
        discardAll: t('dictionary.authoring.discardAll'),
        reviewSuggestions: t('dictionary.authoring.reviewSuggestions'),
        reviewSummary: t('dictionary.authoring.reviewSummary', {
            count: availableSuggestionCount,
            fieldCount: availableSuggestionFieldCount,
        }),
    };
    const cancelLabel = job?.cancellationRequested
        ? t('dictionary.authoring.cancelling')
        : t('dictionary.authoring.cancel');

    function cancelGeneration() {
        void ai.onAction({ kind: 'cancel' }).catch(() => undefined);
    }

    return (
        <section aria-label={labels.aiSection} className={styles.aiControls}>
            <div className={styles.aiActionRow}>
                <strong>
                    <Sparkles aria-hidden='true' size={16} />
                    {labels.aiSection}
                </strong>
                <div className={styles.aiButtons}>
                    {showRegenerate && (
                        <Button
                            disabled={regenerateDisabled}
                            onClick={generateAll}
                            type='button'
                            size='compact'
                            variant='secondary'
                            leadingIcon={
                                <RefreshCw aria-hidden='true' size={16} />
                            }
                        >
                            {labels.regenerateAll}
                        </Button>
                    )}
                    <Button
                        className={styles.primaryAction}
                        disabled={disabled}
                        loading={loading}
                        onClick={generateAll}
                        type='button'
                        size='compact'
                        leadingIcon={<Sparkles aria-hidden='true' size={16} />}
                    >
                        {labels.generate}
                    </Button>
                </div>
            </div>
            <p className={styles.aiHelp}>{labels.generateHelp}</p>
            {isSourceMissing && (
                <p className={styles.sourceHint}>
                    <Info aria-hidden='true' size={14} />
                    {labels.sourceRequired}
                </p>
            )}
            {isActiveJob && (
                <div
                    className={styles.aiProgress}
                    aria-live='polite'
                    role='status'
                >
                    <span>{labels.stage}</span>
                    <Button
                        disabled={job.cancellationRequested}
                        onClick={cancelGeneration}
                        size='compact'
                        type='button'
                        variant='secondary'
                    >
                        {cancelLabel}
                    </Button>
                </div>
            )}
            {isUnavailable && <InlineAlert>{labels.unavailable}</InlineAlert>}
            {isExpired && (
                <InlineAlert tone='warning'>{labels.expired}</InlineAlert>
            )}
            {hasError && <InlineAlert tone='danger'>{ai.error}</InlineAlert>}
            {hasAvailableSuggestions ? (
                <div className={styles.bulkReview}>
                    <div>
                        <strong>{labels.reviewSuggestions}</strong>
                        <small>{labels.reviewSummary}</small>
                    </div>
                    <div className={styles.bulkActions}>
                        <Button
                            disabled={acceptAllDisabled}
                            leadingIcon={
                                <CheckCheck aria-hidden='true' size={16} />
                            }
                            onClick={acceptAllSuggestions}
                            size='compact'
                            type='button'
                        >
                            {labels.acceptAll}
                        </Button>
                        <Button
                            leadingIcon={<X aria-hidden='true' size={16} />}
                            onClick={discardAllSuggestions}
                            size='compact'
                            type='button'
                            variant='secondary'
                        >
                            {labels.discardAll}
                        </Button>
                    </div>
                </div>
            ) : null}
        </section>
    );
}
