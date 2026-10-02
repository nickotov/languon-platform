'use client';

import type { RequestWithSession } from '@/fsd/entities/dictionary';
import { languageDirection, languageLabel } from '@/fsd/entities/dictionary';
import { useSessionStore } from '@/fsd/entities/session';
import { TrainingLauncher } from '@/fsd/features/flashcard-training';
import { LoadingState } from '@/fsd/shared/ui';

import { useDictionaryEditorController } from '../../hooks/use-dictionary-editor-controller';
import { createEditorView } from '../../lib/editor-view-model';
import { EditorAddCard } from '../editor-add-card/editor-add-card';
import { EditorBatchSheet } from '../editor-batch-sheet/editor-batch-sheet';
import { EditorCardSheet } from '../editor-card-sheet/editor-card-sheet';
import { EditorCards } from '../editor-cards/editor-cards';
import { EditorDiscardDialog } from '../editor-discard-dialog/editor-discard-dialog';
import { EditorDocumentSheet } from '../editor-document-sheet/editor-document-sheet';
import { EditorExportSheet } from '../editor-export-sheet/editor-export-sheet';
import { EditorFeedback } from '../editor-feedback/editor-feedback';
import { EditorGenerationReview } from '../editor-generation-review/editor-generation-review';
import { EditorImportSheet } from '../editor-import-sheet/editor-import-sheet';
import { EditorLoadError } from '../editor-load-error/editor-load-error';
import { EditorSettingsSheet } from '../editor-settings-sheet/editor-settings-sheet';
import { EditorSharingSheet } from '../editor-sharing-sheet/editor-sharing-sheet';
import { EditorSummary } from '../editor-summary/editor-summary';
import { EditorToolbar } from '../editor-toolbar/editor-toolbar';
import styles from './dictionary-editor.module.css';

export function DictionaryEditor({
    dictionaryId,
    requestWithSession,
}: {
    dictionaryId: string;
    requestWithSession: RequestWithSession;
}) {
    const model = useDictionaryEditorController(
        dictionaryId,
        requestWithSession,
    );
    const learnerId = useSessionStore((state) => state.user?.id);
    const sessionStatus = useSessionStore((state) => state.status);

    const { dictionary, languages, cards } = model.queries;
    const { t, href } = model.state;
    const loadErrorModel = { dictionary, languages, cards, t, href };

    const loadError =
        dictionary.error ??
        languages.error ??
        (cards.data ? null : cards.error);

    if (loadError)
        return <EditorLoadError model={loadErrorModel} error={loadError} />;

    if (!dictionary.data || !languages.data || !cards.data) {
        return (
            <main id='dictionary-content' tabIndex={-1} className={styles.main}>
                <LoadingState>{t('dictionary.editor.loading')}</LoadingState>
            </main>
        );
    }

    const view = createEditorView(model);

    const { active } = view;
    const current = dictionary.data.dictionary;
    const catalog = languages.data.languages;
    const target = { kind: 'owner' as const, dictionaryId };
    const sourceLanguage = {
        code: current.sourceLanguage,
        name: languageLabel(
            catalog,
            current.sourceLanguage,
            model.state.locale,
        ),
        direction: languageDirection(catalog, current.sourceLanguage),
    };
    const targetLanguage = {
        code: current.targetLanguage,
        name: languageLabel(
            catalog,
            current.targetLanguage,
            model.state.locale,
        ),
        direction: languageDirection(catalog, current.targetLanguage),
    };
    const trainingIdentity = `${learnerId ?? 'anonymous'}:owner:${dictionaryId}`;
    const signedIn = sessionStatus === 'authenticated';

    return (
        <main id='dictionary-content' tabIndex={-1} className={styles.main}>
            <EditorSummary model={view.workspace.summary} />
            <EditorFeedback model={view.workspace.feedback} />
            <EditorToolbar model={view.workspace.toolbar} />
            <EditorCards model={view.workspace.cards} />
            <div className={styles.addCard}>
                <TrainingLauncher
                    activeCount={current.activeCardCount}
                    archived={!active}
                    dictionaryTitle={current.name}
                    identity={trainingIdentity}
                    placement='top'
                    requestWithSession={requestWithSession}
                    signedIn={signedIn}
                    sourceLanguage={sourceLanguage}
                    target={target}
                    targetLanguage={targetLanguage}
                />
                {active ? (
                    <EditorAddCard model={view.workspace.addCard} />
                ) : null}
            </div>
            {active ? (
                <>
                    <EditorDiscardDialog model={view.authoring.discardDialog} />
                    <EditorSettingsSheet model={view.authoring.settingsSheet} />
                    <EditorSharingSheet model={view.authoring.sharingSheet} />
                    <EditorBatchSheet model={view.generation.batchSheet} />
                    <EditorImportSheet model={view.interchange.importSheet} />
                    <EditorExportSheet model={view.interchange.exportSheet} />
                    <EditorDocumentSheet
                        model={view.generation.documentSheet}
                    />
                    <EditorCardSheet model={view.authoring.cardSheet} />
                    <EditorGenerationReview
                        model={view.generation.generationReview}
                    />
                </>
            ) : null}
        </main>
    );
}
