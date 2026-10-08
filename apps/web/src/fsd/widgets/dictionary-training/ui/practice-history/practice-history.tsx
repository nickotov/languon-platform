'use client';

import { Layers, MessageSquareText } from 'lucide-react';
import { useCallback, useEffect } from 'react';
import {
    SavedProgress,
    type LearningApi,
} from '@/fsd/features/flashcard-training';
import {
    isSentenceAccessLoss,
    SentenceHistory,
    useSentenceHistory,
    type SentenceApi,
} from '@/fsd/features/sentence-training';
import { useI18n } from '@/fsd/shared/i18n';
import { Dialog, Tabs } from '@/fsd/shared/ui';
import { useSavedStatistics } from '../../hooks/use-saved-statistics';
import { SentenceStatistics } from '../sentence-statistics/sentence-statistics';
import { historyCopy } from './copy';

export function PracticeHistory({
    open,
    onClose,
    learningApi,
    sentenceApi,
    identity,
    dictionaryTitle,
    sourceLanguage,
    targetLanguage,
    sentencesEnabled,
    inline = false,
    initialTab = 'flashcards',
    onAccessLoss,
}: {
    open: boolean;
    onClose(): void;
    learningApi: LearningApi;
    sentenceApi: SentenceApi;
    identity: string;
    dictionaryTitle: string;
    sourceLanguage: string;
    targetLanguage: string;
    sentencesEnabled: boolean;
    inline?: boolean;
    initialTab?: 'flashcards' | 'sentences';
    onAccessLoss?(): void;
}) {
    const { locale } = useI18n();
    const copy = historyCopy[locale];
    if (inline && !open) return null;
    const items = [
        {
            value: 'flashcards',
            label: copy.flashcards,
            icon: <Layers className='h-4 w-4' />,
            content: (
                <FlashcardStatistics
                    api={learningApi}
                    dictionaryTitle={dictionaryTitle}
                />
            ),
        },
        {
            value: 'sentences',
            label: copy.sentences,
            icon: <MessageSquareText className='h-4 w-4' />,
            content: sentencesEnabled ? (
                <SentenceHistoryTab
                    api={sentenceApi}
                    identity={identity}
                    sourceLanguage={sourceLanguage}
                    targetLanguage={targetLanguage}
                    onClose={onClose}
                    onAccessLoss={onAccessLoss}
                />
            ) : (
                <p className='text-sm text-text-secondary'>
                    {copy.unavailable}
                </p>
            ),
        },
    ];
    const content = (
        <Tabs
            aria-label={copy.title}
            items={items}
            defaultValue={initialTab}
            fullWidth
        />
    );
    if (inline)
        return (
            <section
                className='mx-auto w-full max-w-3xl space-y-4 px-4 py-5'
                aria-label={copy.title}
            >
                <h3 className='text-lg font-semibold'>{copy.title}</h3>
                {content}
            </section>
        );
    return (
        <Dialog open={open} onClose={onClose} size='lg' title={copy.title}>
            {open ? content : null}
        </Dialog>
    );
}

function FlashcardStatistics({
    api,
    dictionaryTitle,
}: {
    api: LearningApi;
    dictionaryTitle: string;
}) {
    const read = useCallback(() => api.getProgress(), [api]);
    const progress = useSavedStatistics(read);
    return (
        <SavedProgress
            progress={progress.result}
            status={progress.status}
            dictionaryTitle={dictionaryTitle}
            onRetry={progress.retry}
        />
    );
}

function SentenceHistoryTab({
    api,
    identity,
    sourceLanguage,
    targetLanguage,
    onClose,
    onAccessLoss,
}: {
    api: SentenceApi;
    identity: string;
    sourceLanguage: string;
    targetLanguage: string;
    onClose(): void;
    onAccessLoss?: (() => void) | undefined;
}) {
    const history = useSentenceHistory({ api, identity });
    useEffect(() => {
        if (history.error && isSentenceAccessLoss(history.error))
            onAccessLoss?.();
    }, [history.error, onAccessLoss]);
    return (
        <div className='space-y-5'>
            <SentenceStatistics
                api={api}
                sourceLanguage={sourceLanguage}
                targetLanguage={targetLanguage}
            />
            <SentenceHistory
                controller={history}
                open
                inline
                onClose={onClose}
            />
        </div>
    );
}
