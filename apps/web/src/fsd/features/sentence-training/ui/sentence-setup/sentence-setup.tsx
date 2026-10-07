'use client';
import { SENTENCE_LIMITS } from '@languon/contracts';
import { useEffect, useState } from 'react';
import { MessageSquareTextIcon, SparklesIcon } from 'lucide-react';
import { usePreparationCopy } from '../sentence-preparation-copy';
import { SentencePreparationOption } from '../sentence-preparation-option/sentence-preparation-option';
import { requestSentenceFullscreen } from '../use-sentence-display';
import { useCompactPresentation } from '../use-compact-presentation';
import { useSentenceCopy } from '../sentence-copy';

import {
    Button,
    Checkbox,
    Dialog,
    Input,
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
        if (prepareAll) void loadEligibleCount?.();
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
        if (!preparation) return;
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
    return (
        <Dialog
            variant={compact ? 'sheet' : 'dialog'}
            className={
                compact ? '!mb-0 !w-full !max-w-none !rounded-b-none' : ''
            }
            open={open}
            onClose={onClose}
            size='md'
            title={t('Sentence practice')}
            description={dictionaryTitle}
            dismissOnOverlayClick={false}
            footer={
                preparing ? (
                    <div className='space-y-2'>
                        <div className='flex flex-wrap items-center justify-end gap-2'>
                            <Button
                                leadingIcon={
                                    <SparklesIcon
                                        aria-hidden
                                        className='h-4 w-4'
                                    />
                                }
                                disabled={invalid || preparation?.busy}
                                onClick={startPreparation}
                            >
                                {P('startPrep')}
                            </Button>
                        </div>
                        <p className='text-end text-xs text-text-secondary'>
                            {P('startWhenReady')}
                        </p>
                    </div>
                ) : (
                    <div className='flex flex-wrap justify-end gap-2'>
                        {!compact && (
                            <Button
                                variant='secondary'
                                disabled={invalid}
                                onClick={() => start(false)}
                            >
                                {t('Start in a dialog')}
                            </Button>
                        )}
                        <Button disabled={invalid} onClick={() => start(true)}>
                            {t('Start in full screen')}
                        </Button>
                    </div>
                )
            }
        >
            <div className='space-y-5'>
                {onOpenLibrary ? (
                    <button
                        type='button'
                        onClick={onOpenLibrary}
                        className='inline-flex items-center gap-1.5 text-sm font-medium text-primary-default underline underline-offset-2 hover:text-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus'
                    >
                        <MessageSquareTextIcon
                            aria-hidden
                            className='h-4 w-4'
                        />
                        {P('openLibrary')}
                    </button>
                ) : null}
                <p className='text-sm text-text-secondary'>
                    {t(
                        'Translate sentences using your dictionary words. Saved sentences and reference answers can be reused.',
                    )}
                </p>
                <RadioGroup
                    label={t('Direction')}
                    value={c.configuration.direction}
                    onChange={(value) =>
                        c.setConfiguration({
                            ...c.configuration,
                            direction: value as Configuration['direction'],
                        })
                    }
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
                    onChange={(event) =>
                        c.setConfiguration({
                            ...c.configuration,
                            explanationLanguage: event.target
                                .value as Configuration['explanationLanguage'],
                        })
                    }
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
                    onChange={(value) =>
                        c.setConfiguration({
                            ...c.configuration,
                            scope:
                                value === 'all'
                                    ? { type: 'all' }
                                    : {
                                          type: 'manual',
                                          entryIds: c.selectedEntryIds,
                                      },
                        })
                    }
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
                <p className='text-sm text-text-secondary'>
                    {batchDescription}
                </p>
                {c.configuration.scope.type === 'manual' ? (
                    <div className='space-y-3 rounded-xl border border-border-default p-3'>
                        <Input
                            label={t('Search entries')}
                            value={c.search}
                            onChange={(event) =>
                                c.setSearch(event.target.value)
                            }
                        />
                        <div className='flex flex-wrap items-center gap-2'>
                            <p className='text-sm text-text-secondary'>
                                {c.selectedEntryIds.length} /{' '}
                                {SENTENCE_LIMITS.selectedEntries}{' '}
                                {t('selected')}
                            </p>
                            <Button
                                size='compact'
                                variant='secondary'
                                disabled={!canSelectShown}
                                onClick={selectShown}
                            >
                                {t('Select all shown')}
                            </Button>
                            <Button
                                size='compact'
                                variant='ghost'
                                onClick={() => c.setSelectedEntryIds([])}
                            >
                                {t('Clear')}
                            </Button>
                        </div>
                        {c.selectedEntryIds.length === 0 ? (
                            <p className='text-sm text-text-secondary'>
                                {t('Choose at least one entry to start.')}
                            </p>
                        ) : null}
                        {selectionFull ? (
                            <p
                                role='status'
                                className='text-sm text-text-secondary'
                            >
                                {t(
                                    'Batch limit reached. Deselect a word to choose another.',
                                )}
                            </p>
                        ) : null}
                        {c.entriesError ? (
                            <SentenceErrorNotice
                                error={c.entriesError}
                                onRetry={c.refresh}
                            />
                        ) : null}
                        <ul className='max-h-52 space-y-2 overflow-y-auto'>
                            {c.entries.map((entry) => (
                                <li key={entry.entryId}>
                                    <Checkbox
                                        disabled={
                                            selectionFull &&
                                            !c.selectedEntryIds.includes(
                                                entry.entryId,
                                            )
                                        }
                                        checked={c.selectedEntryIds.includes(
                                            entry.entryId,
                                        )}
                                        onChange={(event) =>
                                            c.setSelectedEntryIds(
                                                event.target.checked
                                                    ? [
                                                          ...c.selectedEntryIds,
                                                          entry.entryId,
                                                      ]
                                                    : c.selectedEntryIds.filter(
                                                          (id) =>
                                                              id !==
                                                              entry.entryId,
                                                      ),
                                            )
                                        }
                                    >
                                        {entry.source} → {entry.translation}
                                    </Checkbox>
                                </li>
                            ))}
                        </ul>
                        {c.entriesLoading ? (
                            <LoadingState>{t('Loading entries')}</LoadingState>
                        ) : c.entries.length === 0 ? (
                            <p className='text-sm text-text-secondary'>
                                {t('No entries match your search.')}
                            </p>
                        ) : null}
                        {c.hasMore ? (
                            <Button
                                variant='secondary'
                                size='compact'
                                loading={c.entriesLoading}
                                onClick={() => void c.loadMore()}
                            >
                                {t('Load more entries')}
                            </Button>
                        ) : null}
                    </div>
                ) : null}
                <RadioGroup
                    label={t('Sentences')}
                    value={c.configuration.mode}
                    onChange={(value) =>
                        c.setConfiguration({
                            ...c.configuration,
                            mode: value as Configuration['mode'],
                        })
                    }
                    variant='card'
                    options={[
                        {
                            value: 'saved-first',
                            label: (
                                <>
                                    <strong>{t('Saved first')}</strong>
                                    <p className='mt-1 text-sm text-text-secondary'>
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
                                    <p className='mt-1 text-sm text-text-secondary'>
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
                                    <p className='mt-1 text-sm text-text-secondary'>
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
                    <div className='rounded-xl border border-border-default bg-background-subtle p-4 text-sm'>
                        <div className='grid grid-cols-2 gap-3'>
                            <p>
                                <strong>{prepared.eligibleCount}</strong>{' '}
                                {t('eligible entries')}
                            </p>
                            <p>
                                <strong>{prepared.skippedCount}</strong>{' '}
                                {t('skipped')}
                            </p>
                            <p>
                                <strong>{prepared.usedCount}</strong>{' '}
                                {t('seen in sentences')}
                            </p>
                            <p>
                                <strong>{prepared.remainingCount}</strong>{' '}
                                {t('not seen yet')}
                            </p>
                            <p>
                                <strong>{prepared.savedReviewCount}</strong>{' '}
                                {t('saved sentences')}
                            </p>
                        </div>
                        {prepared.skippedCount ? (
                            <details className='mt-3 text-xs text-text-secondary'>
                                <summary className='cursor-pointer'>
                                    {t('Why entries are skipped')}
                                </summary>
                                <p className='mt-2'>
                                    {t(
                                        'Entries without a complete source and translation are skipped.',
                                    )}
                                </p>
                            </details>
                        ) : null}
                        <p className='mt-3 text-xs text-text-tertiary'>
                            {t(
                                'Exposure counts are not mastery scores. Generating sentences and checking with AI use credits. Showing a saved reference answer is free.',
                            )}
                        </p>
                        {prepared.eligibleCount === 0 ? (
                            <p className='mt-3 text-text-secondary'>
                                {t(
                                    'No eligible entries. Add complete translations to your dictionary first.',
                                )}
                            </p>
                        ) : null}
                        {c.configuration.mode === 'review-only' &&
                        prepared.savedReviewCount === 0 ? (
                            <p className='mt-3 text-text-secondary'>
                                {t(
                                    'No saved sentences yet. Choose Saved first or Generate new sentences to create them.',
                                )}
                            </p>
                        ) : null}
                    </div>
                ) : null}
                {preparation ? (
                    <div className='border-t border-border-default pt-4'>
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
