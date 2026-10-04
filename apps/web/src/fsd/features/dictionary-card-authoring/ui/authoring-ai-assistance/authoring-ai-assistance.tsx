import { Info, RefreshCw, Sparkles } from 'lucide-react';
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
    locked,
    hasContent,
    validSource,
    canGenerate,
    generateAll,
}: {
    ai: DictionaryCardAuthoringAI;
    active: boolean;
    locked: boolean;
    hasContent: boolean;
    validSource: boolean;
    canGenerate: boolean;
    generateAll(): void;
}) {
    const { t } = useI18n();
    const legacyReview =
        ai.format === 'card-authoring:v1' && Boolean(ai.proposal);
    const disabled =
        !validSource ||
        !ai.available ||
        !canGenerate ||
        locked ||
        ai.pending ||
        legacyReview;
    const loading = ai.pending && !active;
    const job = ai.job;
    const hasJob = job !== null && job !== undefined;
    const isActiveJob = active && hasJob;
    const isSourceMissing = !validSource;
    const isUnavailable = !ai.available;
    const isExpired = job?.state === 'expired';
    const hasError = Boolean(ai.error);
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
    };
    const cancelLabel = job?.cancellationRequested
        ? t('dictionary.authoring.cancelling')
        : t('dictionary.authoring.cancel');
    const actionLabel = hasContent ? labels.regenerateAll : labels.generate;
    const regenerationIcon = hasContent ? (
        <RefreshCw aria-hidden size={16} />
    ) : undefined;

    function cancelGeneration() {
        void ai.onAction({ kind: 'cancel' }).catch(() => undefined);
    }

    return (
        <section aria-label={labels.aiSection} className={styles.aiControls}>
            <div className={styles.aiActionRow}>
                <strong className={styles.aiTitle}>
                    <Sparkles aria-hidden='true' size={16} />
                    {labels.aiSection}
                </strong>
                <div className={styles.aiButtons}>
                    <Button
                        className={styles.primaryAction}
                        disabled={disabled}
                        loading={loading}
                        onClick={generateAll}
                        type='button'
                        size='compact'
                        leadingIcon={<Sparkles aria-hidden='true' size={16} />}
                        trailingIcon={regenerationIcon}
                    >
                        {actionLabel}
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
        </section>
    );
}
