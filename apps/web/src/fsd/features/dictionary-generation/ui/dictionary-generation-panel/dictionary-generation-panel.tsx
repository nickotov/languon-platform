'use client';

import { useI18n } from '@/fsd/shared/i18n';
import { BottomSheet, Textarea } from '@/fsd/shared/ui';

import { useGenerationReview } from '../../hooks/use-generation-review';
import type { GenerationReviewProps } from '../../model/generation-review';
import { ReviewFields } from '../review-field/review-fields';
import { ReviewFooter } from '../review-footer/review-footer';
import { ReviewStatus } from '../review-status/review-status';
import styles from './dictionary-generation-panel.module.css';

export function DictionaryGenerationPanel(props: GenerationReviewProps) {
    const { t } = useI18n();
    const state = useGenerationReview(props);
    const {
        available,
        card,
        conflict,
        currentCard,
        dictionary,
        error,
        job,
        languages,
        onClose,
        pendingAction,
    } = props;

    const dialogClassName = styles.dialog ?? '';
    const title = t('dictionary.generation.title');
    const closeLabel = t('dictionary.generation.close');
    const instructionLabel = t('dictionary.generation.instruction');
    const instructionHint = t('dictionary.generation.instructionHint');
    const source = card?.values.source ?? job?.originalSnapshot?.values.source;
    const description = source
        ? `${source} · ${dictionary.name}`
        : dictionary.name;
    const busyLabel =
        job?.state === 'queued'
            ? t('dictionary.generation.phase.queued')
            : t('dictionary.generation.phase.running');
    const unchangedLabel = t('dictionary.generation.progressUnchanged');
    const cancellationRequested = job?.cancellationRequested ?? false;
    const dismissible = !pendingAction;
    const footer = (
        <ReviewFooter
            cancellationRequested={cancellationRequested}
            onClose={onClose}
            pending={pendingAction}
            state={state}
        />
    );

    return (
        <BottomSheet
            className={dialogClassName}
            closeLabel={closeLabel}
            description={description}
            dismissible={dismissible}
            dismissOnOverlayClick={false}
            footer={footer}
            onClose={onClose}
            open
            size='lg'
            title={title}
        >
            <div className={styles.content}>
                <ReviewStatus
                    available={available}
                    conflict={conflict}
                    currentCard={currentCard}
                    dictionary={dictionary}
                    error={error}
                    job={job}
                    languages={languages}
                    onReload={state.handleReload}
                />
                <Textarea
                    description={instructionHint}
                    disabled={state.instructionDisabled}
                    label={instructionLabel}
                    maxLength={1000}
                    onChange={state.handleInstructionChange}
                    rows={2}
                    showCount
                    value={state.instruction}
                />
                {state.busy ? (
                    <div
                        aria-live='polite'
                        className={styles.progress}
                        role='status'
                    >
                        {busyLabel} <span>{unchangedLabel}</span>
                    </div>
                ) : null}
                {state.ready && state.candidate && job ? (
                    <ReviewFields
                        candidate={state.candidate}
                        job={job}
                        languages={languages}
                        onChange={state.changeValue}
                    />
                ) : null}
            </div>
        </BottomSheet>
    );
}
