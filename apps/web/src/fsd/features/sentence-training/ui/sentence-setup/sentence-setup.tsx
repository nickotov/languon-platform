'use client';
import styles from '../styles/sentence-setup-common.module.css';
import { SENTENCE_LIMITS } from '@languon/contracts';
import { useEffect, useState, type ChangeEvent } from 'react';
import { SentenceEntrySelection } from './ui/sentence-entry-selection/sentence-entry-selection';
import { SentenceSetupEstimate } from './ui/sentence-setup-estimate/sentence-setup-estimate';
import { MessageSquareTextIcon, SparklesIcon } from 'lucide-react';
import { usePreparationCopy } from '../sentence-preparation-copy';
import { SentencePreparationOption } from '../sentence-preparation-option/sentence-preparation-option';
import { requestSentenceFullscreen } from '../use-sentence-display';
import { useCompactPresentation } from '../use-compact-presentation';
import { useSentenceCopy } from '../sentence-copy';

import {
    Button,
    Dialog,
    DialogActions,
    LoadingState,
    RadioGroup,
    Select,
} from '@/fsd/shared/ui';
import type {
    Configuration,
    SentenceSetupController,
    SentencePreparationController,
} from '../../types';
import { SentenceErrorNotice } from '../sentence-errors/sentence-errors';

export type SentenceSetupProps = {
    controller: SentenceSetupController;
    open: boolean;
    onClose(): void;
    onStart(configuration: Configuration, fullscreen?: Promise<boolean>): void;
    sourceLanguage: string;
    targetLanguage: string;
    dictionaryTitle?: string;
    preparation?: SentencePreparationController;
    initialPreparationEnabled?: boolean;
    totalEligibleCount?: number;
    onViewPreparation?(): void;
    onOpenLibrary?(): void;
};

export function SentenceSetup({
    controller: c,

    open,
    onClose,
    onStart,
    sourceLanguage,
    targetLanguage,
    dictionaryTitle,
    preparation,
    initialPreparationEnabled = false,
    totalEligibleCount,
    onViewPreparation,
    onOpenLibrary,
}: SentenceSetupProps) {
    const { t, languageName } = useSentenceCopy();
    const compact = useCompactPresentation();
    const { P } = usePreparationCopy();
    const [prepareAll, setPrepareAll] = useState(initialPreparationEnabled);
    const loadEligibleCount = preparation?.loadEligibleCount;
    useEffect(() => {
        if (prepareAll) {
            void loadEligibleCount?.();
        }
    }, [prepareAll, loadEligibleCount]);

    const activePreparation =
        preparation?.preparation &&
        !['completed', 'failed'].includes(preparation.preparation.state) &&
        preparation.preparation.pauseReason !== 'stale' &&
        preparation.preparation.pauseReason !== 'access';
    const preparing = !!preparation && prepareAll && !activePreparation;
    function viewPreparation() {
        onViewPreparation?.();
    }

    function startPreparation() {
        if (!preparation) {
            return;
        }

        onViewPreparation?.();
        void preparation.start(c.configuration);
    }

    const prepared = c.prepared;
    const selectionFull =
        c.selectedEntryIds.length >= SENTENCE_LIMITS.selectedEntries;
    const shownSelection = [
        ...new Set([
            ...c.selectedEntryIds,
            ...c.entries.map((entry) => entry.entryId),
        ]),
    ];
    const canSelectShown =
        !selectionFull &&
        c.entries.length > 0 &&
        shownSelection.length <= SENTENCE_LIMITS.selectedEntries;
    const batchDescription = t(
        'Each round uses up to {limit} words. A dictionary batch uses the first eligible words. Choose entries to practise other words.',
    ).replace('{limit}', String(SENTENCE_LIMITS.selectedEntries));

    function selectShown() {
        c.setSelectedEntryIds(shownSelection);
    }

    const invalid =
        c.loading ||
        !!c.error ||
        !prepared ||
        prepared.eligibleCount === 0 ||
        (c.configuration.scope.type === 'manual' &&
            c.selectedEntryIds.length === 0);

    function start(fullscreen: boolean) {
        const request = fullscreen ? requestSentenceFullscreen() : undefined;
        onStart(c.configuration, request);
    }

    function startDialog() {
        start(false);
    }

    function startFullscreen() {
        start(true);
    }

    function changeDirection(value: string) {
        c.setConfiguration({
            ...c.configuration,
            direction: value as Configuration['direction'],
        });
    }

    function changeExplanation(event: ChangeEvent<HTMLSelectElement>) {
        c.setConfiguration({
            ...c.configuration,
            explanationLanguage: event.target
                .value as Configuration['explanationLanguage'],
        });
    }

    function changeScope(value: string) {
        c.setConfiguration({
            ...c.configuration,
            scope:
                value === 'all'
                    ? { type: 'all' }
                    : { type: 'manual', entryIds: c.selectedEntryIds },
        });
    }

    function changeMode(value: string) {
        c.setConfiguration({
            ...c.configuration,
            mode: value as Configuration['mode'],
        });
    }

    return (
        <Dialog
            variant={compact ? 'sheet' : 'dialog'}
            className={compact ? styles.compactDialog : ''}
            open={open}
            onClose={onClose}
            size='md'
            title={t('Sentence practice')}
            description={dictionaryTitle}
            dismissOnOverlayClick={false}
            footer={
                preparing ? (
                    <div className={styles.footer}>
                        <DialogActions className={styles.preparationActions}>
                            <Button
                                leadingIcon={
                                    <SparklesIcon
                                        aria-hidden
                                        className={styles.icon}
                                    />
                                }
                                disabled={invalid || preparation?.busy}
                                onClick={startPreparation}
                            >
                                {P('startPrep')}
                            </Button>
                        </DialogActions>
                        <p className={styles.preparationNote}>
                            {P('startWhenReady')}
                        </p>
                    </div>
                ) : (
                    <DialogActions className={styles.footerActions}>
                        {!compact && (
                            <Button
                                variant='secondary'
                                disabled={invalid}
                                onClick={startDialog}
                            >
                                {t('Start in a dialog')}
                            </Button>
                        )}
                        <Button disabled={invalid} onClick={startFullscreen}>
                            {t('Start in full screen')}
                        </Button>
                    </DialogActions>
                )
            }
        >
            <div className={styles.setupContent}>
                {onOpenLibrary ? (
                    <button
                        type='button'
                        onClick={onOpenLibrary}
                        className={styles.aiSettingsAction}
                    >
                        <MessageSquareTextIcon
                            aria-hidden
                            className={styles.icon}
                        />
                        {P('openLibrary')}
                    </button>
                ) : null}
                <p className={styles.setupNote}>
                    {t(
                        'Translate sentences using your dictionary words. Saved sentences and reference answers can be reused.',
                    )}
                </p>
                <RadioGroup
                    label={t('Direction')}
                    value={c.configuration.direction}
                    onChange={changeDirection}
                    orientation='horizontal'
                    variant='card'
                    options={[
                        {
                            value: 'source-to-target',
                            label: `${languageName(sourceLanguage)} → ${languageName(targetLanguage)}`,
                        },
                        {
                            value: 'target-to-source',
                            label: `${languageName(targetLanguage)} → ${languageName(sourceLanguage)}`,
                        },
                    ]}
                />
                <Select
                    label={t('Explanation language')}
                    value={
                        c.configuration.explanationLanguage ?? sourceLanguage
                    }
                    onChange={changeExplanation}
                    options={[
                        ...new Set([
                            sourceLanguage,
                            targetLanguage,
                            'en',
                            'ru',
                            'fr',
                            'es',
                        ]),
                    ].map((language) => ({
                        value: language,
                        label: languageName(language),
                    }))}
                />
                <RadioGroup
                    label={t('Vocabulary')}
                    value={c.configuration.scope.type}
                    onChange={changeScope}
                    orientation='horizontal'
                    options={[
                        {
                            value: 'all',
                            label: prepared
                                ? `${t('Dictionary batch')} · ${prepared.eligibleCount}`
                                : t('Dictionary batch'),
                        },
                        { value: 'manual', label: t('Choose entries') },
                    ]}
                />
                <p className={styles.setupNote}>{batchDescription}</p>
                {c.configuration.scope.type === 'manual' ? (
                    <SentenceEntrySelection
                        c={c}
                        selectionFull={selectionFull}
                        canSelectShown={canSelectShown}
                        selectShown={selectShown}
                    />
                ) : null}
                <RadioGroup
                    label={t('Sentences')}
                    value={c.configuration.mode}
                    onChange={changeMode}
                    variant='card'
                    options={[
                        {
                            value: 'saved-first',
                            label: (
                                <>
                                    <strong>{t('Saved first')}</strong>
                                    <p className={styles.optionNote}>
                                        {t(
                                            'Reuse saved sentences, including completed ones; generate only for words without saved examples.',
                                        )}
                                    </p>
                                </>
                            ),
                        },
                        {
                            value: 'new-only',
                            label: (
                                <>
                                    <strong>
                                        {t('Generate new sentences')}
                                    </strong>
                                    <p className={styles.optionNote}>
                                        {t(
                                            'Add fresh sentences. Earlier generations stay saved.',
                                        )}
                                    </p>
                                </>
                            ),
                        },
                        {
                            value: 'review-only',
                            label: (
                                <>
                                    <strong>{t('Review saved only')}</strong>
                                    <p className={styles.optionNote}>
                                        {t(
                                            'Reuse saved sentences, including completed ones. No generation.',
                                        )}
                                    </p>
                                </>
                            ),
                        },
                    ]}
                />
                {c.loading ? (
                    <LoadingState>{t('Preparing practice')}</LoadingState>
                ) : null}
                {c.error ? (
                    <SentenceErrorNotice error={c.error} onRetry={c.refresh} />
                ) : null}
                {prepared ? (
                    <SentenceSetupEstimate
                        prepared={prepared}
                        mode={c.configuration.mode}
                    />
                ) : null}
                {preparation ? (
                    <div className={styles.preparationOption}>
                        <SentencePreparationOption
                            enabled={prepareAll}
                            onChange={setPrepareAll}
                            roundWords={prepared?.eligibleCount ?? 0}
                            totalWords={
                                totalEligibleCount ?? preparation.eligibleCount
                            }
                            mode={c.configuration.mode}
                            controller={preparation}
                            onView={viewPreparation}
                        />
                    </div>
                ) : null}
            </div>
        </Dialog>
    );
}
