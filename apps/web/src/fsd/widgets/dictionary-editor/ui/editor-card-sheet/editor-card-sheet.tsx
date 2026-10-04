import {
    dictionaryErrorMessage,
    languageLabel,
} from '@/fsd/entities/dictionary';
import {
    cardAuthoringFailureMessageKey,
    DictionaryCardForm,
} from '@/fsd/features/dictionary-card-authoring';
import { BottomSheet } from '@/fsd/shared/ui';
import type { ComponentProps } from 'react';
import type { EditorViewFields } from '../../lib/editor-workspace';
import styles from './editor-card-sheet.module.css';
import { cardSaveFeedback } from '../../lib/card-save-feedback';

type EditorCardSheetModel = Pick<
    EditorViewFields,
    | 't'
    | 'locale'
    | 'setCardDraftDirty'
    | 'editing'
    | 'authoringReviewJob'
    | 'generationCapabilities'
    | 'authoringJob'
    | 'cardMutation'
    | 'cardAutoSave'
    | 'cardAuthoringAction'
    | 'requestCloseCardDraft'
    | 'current'
    | 'catalog'
    | 'cardList'
    | 'reloadAfterConflict'
>;

type DictionaryCardFormProps = ComponentProps<typeof DictionaryCardForm>;
type AuthoringActionHandler = NonNullable<
    DictionaryCardFormProps['ai']
>['onAction'];

export function shouldAcceptAuthoringProposal(
    hasReview: boolean,
    selectedSuggestionCount: number,
    isNewCard = true,
    hasGeneration = false,
) {
    return (
        (hasGeneration || (isNewCard && hasReview)) &&
        selectedSuggestionCount > 0
    );
}

export function buildAiValue(
    model: Pick<
        EditorCardSheetModel,
        | 'authoringJob'
        | 'authoringReviewJob'
        | 'cardAuthoringAction'
        | 'generationCapabilities'
        | 't'
    >,
    onAction: AuthoringActionHandler,
): DictionaryCardFormProps['ai'] {
    const { authoringJob, authoringReviewJob, cardAuthoringAction } = model;
    const requestError = cardAuthoringAction.error ?? authoringJob.error;
    let error: string | null = null;

    if (requestError) {
        error = dictionaryErrorMessage(requestError, model.t);
    } else if (authoringJob.data?.state === 'failed') {
        error = model.t(
            cardAuthoringFailureMessageKey(authoringJob.data.failure?.code),
        );
    }

    const hasRunningSuccessor =
        Boolean(authoringReviewJob) &&
        (authoringJob.data?.state === 'queued' ||
            authoringJob.data?.state === 'running');

    return {
        available:
            model.generationCapabilities.data?.cardAuthoringGeneration
                .available === true,
        error,
        format: authoringReviewJob?.format ?? authoringJob.data?.format,
        job: authoringJob.data ?? null,
        onAction,
        pending: cardAuthoringAction.isPending,
        proposal: authoringReviewJob?.proposal ?? null,
        ...(authoringReviewJob ? { proposalJobId: authoringReviewJob.id } : {}),
        successorActive: hasRunningSuccessor,
    };
}

export function EditorCardSheet({ model }: { model: EditorCardSheetModel }) {
    const {
        t,
        locale,
        setCardDraftDirty,
        editing,
        authoringReviewJob,
        authoringJob,
        cardMutation,
        cardAutoSave,
        cardAuthoringAction,
        requestCloseCardDraft,
        current,
        catalog,
        cardList,
        reloadAfterConflict,
    } = model;
    if (!editing) return null;

    const isNewCard = editing === 'new';
    const hasRunningSuccessor =
        Boolean(authoringReviewJob) &&
        (authoringJob.data?.state === 'queued' ||
            authoringJob.data?.state === 'running');

    const classNameValue: ComponentProps<typeof BottomSheet>['className'] =
        styles.editorSheet ?? '';

    const dismissibleValue: ComponentProps<typeof BottomSheet>['dismissible'] =
        !cardMutation.isPending &&
        !cardAuthoringAction.isPending &&
        !cardAutoSave.isPending;

    const titleValue: ComponentProps<typeof BottomSheet>['title'] = isNewCard
        ? t('dictionary.card.createTitle')
        : t('dictionary.card.editTitle');

    const handleAuthoringAction: NonNullable<
        ComponentProps<typeof DictionaryCardForm>['ai']
    >['onAction'] = async (action) => {
        await cardAuthoringAction.mutateAsync(action);
    };

    const aiValue = buildAiValue(model, handleAuthoringAction);

    const cardValue: ComponentProps<typeof DictionaryCardForm>['card'] =
        isNewCard ? undefined : editing;

    const existingSourcesValue: ComponentProps<
        typeof DictionaryCardForm
    >['existingSources'] = cardList
        .filter((candidate) => isNewCard || candidate.id !== editing.id)
        .map((candidate) => candidate.values.source);

    const saveError = cardAutoSave.error ?? cardMutation.error;
    const saveFeedback = cardSaveFeedback(saveError, t);
    const errorValue: ComponentProps<typeof DictionaryCardForm>['error'] =
        saveFeedback.message;

    const handleReloadConflict: ComponentProps<
        typeof DictionaryCardForm
    >['onReloadConflict'] = saveFeedback.conflict
        ? reloadAfterConflict
        : undefined;

    const handleSave: ComponentProps<
        typeof DictionaryCardForm
    >['onSave'] = async (draft, selectedSuggestions, generation) => {
        if (
            shouldAcceptAuthoringProposal(
                Boolean(authoringReviewJob),
                selectedSuggestions.length,
                isNewCard,
                Boolean(generation),
            )
        ) {
            if (hasRunningSuccessor) {
                throw new Error('Card authoring successor is active');
            }

            await cardAuthoringAction.mutateAsync({
                draft,
                kind: 'accept',
                selectedSuggestions,
                ...(generation ? { generation } : {}),
            });
            return;
        }

        if (isNewCard) {
            await cardMutation.mutateAsync({ draft });
            return;
        }

        await cardMutation.mutateAsync({ card: editing, draft });
    };

    const sourceLanguage = languageLabel(
        catalog,
        current.sourceLanguage,
        locale,
    );
    const targetLanguage = languageLabel(
        catalog,
        current.targetLanguage,
        locale,
    );
    const description = `${current.name} · ${sourceLanguage} → ${targetLanguage}`;
    const closeLabel = t(isNewCard ? 'common.cancel' : 'dictionary.card.close');

    const pendingValue: ComponentProps<typeof DictionaryCardForm>['pending'] =
        cardMutation.isPending ||
        (cardAuthoringAction.isPending &&
            cardAuthoringAction.variables?.kind === 'accept');
    const handleAutoSave: NonNullable<
        DictionaryCardFormProps['onAutoSave']
    > = async (draft, selectedSuggestions, generation) =>
        cardAutoSave.mutateAsync({ draft, selectedSuggestions, generation });

    return (
        <BottomSheet
            bodyClassName={styles.editorBody}
            headerClassName={styles.editorHeader}
            titleClassName={styles.editorTitle}
            className={classNameValue}
            closeLabel={closeLabel}
            dismissible={dismissibleValue}
            onClose={requestCloseCardDraft}
            open
            size='large'
            title={titleValue}
            description={description}
        >
            <DictionaryCardForm
                ai={aiValue}
                card={cardValue}
                dictionary={current}
                embedded
                existingSources={existingSourcesValue}
                error={errorValue}
                languages={catalog}
                onCancel={requestCloseCardDraft}
                onDirtyChange={setCardDraftDirty}
                onReloadConflict={handleReloadConflict}
                onSave={handleSave}
                onAutoSave={handleAutoSave}
                pending={pendingValue}
                showHeading={false}
            />
        </BottomSheet>
    );
}
