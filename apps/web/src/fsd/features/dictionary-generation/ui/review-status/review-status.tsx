import { useI18n } from '@/fsd/shared/i18n';
import { Button, InlineAlert } from '@/fsd/shared/ui';

import { terminalStateMessageKey } from '../../lib/review-fields';
import type { GenerationReviewProps } from '../../model/generation-review';
import styles from '../dictionary-generation-panel-common.module.css';
import { ReviewCurrentCard } from './review-current-card';

export function ReviewStatus({
    available,
    conflict,
    currentCard,
    dictionary,
    error,
    job,
    languages,
    onReload,
}: Pick<
    GenerationReviewProps,
    | 'available'
    | 'conflict'
    | 'currentCard'
    | 'dictionary'
    | 'error'
    | 'job'
    | 'languages'
> & { onReload(): void }) {
    const { t } = useI18n();

    const retained = job?.state === 'review';

    const savedTitle = t('dictionary.generation.savedUnchangedTitle');

    const savedBody = t('dictionary.generation.savedUnchangedBody');

    const retainedTitle = t('dictionary.generation.retainedTitle');

    const retainedBody = t('dictionary.generation.retainedBody');

    const pausedTitle = t('dictionary.generation.pausedTitle');

    const pausedBody = t('dictionary.generation.pausedBody');

    const conflictTitle = t('dictionary.generation.conflictTitle');

    const conflictBody = t('dictionary.generation.conflictHelp');

    const reloadLabel = t('dictionary.generation.reloadCompare');

    const unavailableLabel = t('dictionary.generation.error.unavailable');

    const failureLabel = t('dictionary.generation.state.failed');

    const warningLabel = t('dictionary.generation.warnings');

    const warnings = job?.proposal?.warnings ?? [];

    const terminalKey = job ? terminalStateMessageKey(job.state) : undefined;

    const terminalLabel = terminalKey ? t(terminalKey) : null;

    const terminalTone = job?.state === 'accepted' ? 'success' : 'info';

    return (
        <>
            <InlineAlert title={savedTitle} tone='tip'>
                {savedBody}
            </InlineAlert>
            {retained ? (
                <InlineAlert title={retainedTitle} tone='info'>
                    {retainedBody}
                </InlineAlert>
            ) : null}
            {!available && retained ? (
                <InlineAlert title={pausedTitle} tone='warning'>
                    {pausedBody}
                </InlineAlert>
            ) : null}
            {!available && !retained ? (
                <InlineAlert tone='info'>{unavailableLabel}</InlineAlert>
            ) : null}
            {error ? <InlineAlert tone='danger'>{error}</InlineAlert> : null}
            {conflict ? (
                <InlineAlert title={conflictTitle} tone='danger'>
                    <p>{conflictBody}</p>
                    <Button
                        onClick={onReload}
                        type='button'
                        variant='secondary'
                    >
                        {reloadLabel}
                    </Button>
                </InlineAlert>
            ) : null}
            {conflict && currentCard ? (
                <ReviewCurrentCard
                    card={currentCard}
                    dictionary={dictionary}
                    languages={languages}
                />
            ) : null}
            {terminalLabel ? (
                <InlineAlert tone={terminalTone}>{terminalLabel}</InlineAlert>
            ) : null}
            {job?.state === 'failed' ? (
                <InlineAlert title={failureLabel} tone='danger'>
                    {job.failure?.message}
                </InlineAlert>
            ) : null}
            {retained && warnings.length ? (
                <InlineAlert title={warningLabel} tone='warning'>
                    <ul className={styles.warningList}>
                        {warnings.map((warning, index) => (
                            <li key={`${index}-${warning}`}>{warning}</li>
                        ))}
                    </ul>
                </InlineAlert>
            ) : null}
        </>
    );
}
