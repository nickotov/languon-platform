'use client';

import { useState, type ReactNode } from 'react';
import { TextLanguageSchema } from '@languon/contracts';
import { ActionConsentDialog } from '@/fsd/entities/ai-action';
import {
    BilingualTextView,
    type LearningBlockViewProps,
    type LearningPrivateStudy,
} from '@/fsd/entities/learning-blocks';
import {
    knowledgeLearningBlockLabels,
    type KnowledgeLibraryContext,
    type KnowledgeReadingBlockOverrides,
} from '@/fsd/features/knowledge-notes';
import { useI18n } from '@/fsd/shared/i18n';
import { usePrivateTranslation } from '../../hooks/use-private-translation';
import { privateTranslationCopy } from '../../lib/copy';
import type { KnowledgePrivateTranslationProps } from '../../types';

export interface KnowledgeBilingualStudyProps extends KnowledgePrivateTranslationProps {
    viewOptions?:
        Omit<Partial<LearningBlockViewProps>, 'block' | 'labels'> | undefined;
    library?: KnowledgeLibraryContext | undefined;
    children: (overrides: KnowledgeReadingBlockOverrides) => ReactNode;
}

/** One inline reading surface; personal overlays stay outside the author's block. */
export function KnowledgeBilingualStudy(props: KnowledgeBilingualStudyProps) {
    const { locale } = useI18n();
    const copy = privateTranslationCopy(locale);
    const labels = knowledgeLearningBlockLabels(locale).view;
    const model = usePrivateTranslation(props);
    const [privateLanguage, setPrivateLanguage] = useState<string | undefined>(
        props.block.translations.length ? undefined : model.targets[0],
    );
    const names = new Intl.DisplayNames([locale], { type: 'language' });
    function displayLanguage(language: string) {
        try {
            return names.of(language) ?? language;
        } catch {
            return language;
        }
    }
    const languageNames = Object.fromEntries(
        [
            ...props.block.translations.map((item) => item.language),
            ...model.targets,
        ].map((language) => [language, displayLanguage(language)]),
    );
    const overlay = model.translations.find(
        (item) => item.targetLanguage === privateLanguage,
    );
    function selectLanguage(language: string) {
        model.setLanguage(TextLanguageSchema.parse(language));
    }
    function generate() {
        void model.generate();
    }
    function retry() {
        void model.retry();
    }
    function cancel() {
        void model.cancel();
    }
    let state: LearningPrivateStudy['state'] = 'idle';
    if (model.loading) state = 'loading';
    if (model.busy) state = 'generating';
    if (model.failed) state = 'failed';
    if (model.unavailable) state = 'unavailable';
    const study: LearningPrivateStudy = {
        targets: model.targets.map((language) => ({
            language,
            label: `${languageNames[language]} · ${copy.title}`,
        })),
        overlays: model.translations.map((item) => ({
            language: item.targetLanguage,
            segments: item.segments,
        })),
        state,
        pendingLanguage: model.pendingLanguage,
        languageNames,
        canCancel: model.canCancel,
        labels: {
            title: copy.title,
            notice: copy.notice,
            loading: copy.loading,
            generating: copy.busy,
            generate: copy.generate,
            retry: copy.retry,
            cancel: copy.cancel,
            error: copy.error,
            unavailable: copy.unavailable,
            remove: copy.remove,
        },
        onSelectLanguage: selectLanguage,
        onViewChange: setPrivateLanguage,
        onGenerate: generate,
        onRetry: retry,
        onCancel: cancel,
    };
    const content = (
        <BilingualTextView
            {...props.viewOptions}
            block={props.block}
            labels={labels}
            variant='learner'
            privateStudy={study}
        />
    );
    let library = props.library;
    if (overlay && library && library.noteVersion !== undefined)
        library = {
            ...library,
            translationLanguage: overlay.targetLanguage,
            privateTranslation: {
                sourceFingerprint: overlay.sourceFingerprint,
                updatedAt: overlay.updatedAt,
            },
        };
    return (
        <>
            {props.children({ content, library })}
            <ActionConsentDialog
                quote={model.consent.quote}
                onSend={model.consent.confirm}
                onClose={model.consent.cancel}
            />
        </>
    );
}
