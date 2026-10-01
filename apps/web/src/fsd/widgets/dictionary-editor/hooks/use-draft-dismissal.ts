import type { useAuthoringCleanup } from './use-authoring-cleanup';
import type { useAuthoringMutation } from './use-authoring-mutation';
import type { useCardMutation } from './use-card-mutation';
import type { useCardAutoSave } from './use-card-auto-save';
import type { useEditorState } from './use-editor-state';

export function useDraftDismissal({
    cardDraftDirty,
    setCardDraftDirty,
    setConfirmCardDiscard,
    setEditing,
    setAuthoringJobId,
    setAuthoringReviewJob,
    authoringAttempt,
    queueCardAuthoringCleanup,
    flushCardAuthoringCleanup,
    cardMutation,
    cardAuthoringAction,
    cardAutoSave,
}: Pick<
    ReturnType<typeof useEditorState>,
    | 'cardDraftDirty'
    | 'setCardDraftDirty'
    | 'setConfirmCardDiscard'
    | 'setEditing'
    | 'setAuthoringJobId'
    | 'setAuthoringReviewJob'
    | 'authoringAttempt'
> &
    Pick<
        ReturnType<typeof useAuthoringCleanup>,
        'queueCardAuthoringCleanup' | 'flushCardAuthoringCleanup'
    > &
    Pick<ReturnType<typeof useCardMutation>, 'cardMutation'> &
    Pick<ReturnType<typeof useAuthoringMutation>, 'cardAuthoringAction'> &
    Pick<ReturnType<typeof useCardAutoSave>, 'cardAutoSave'>) {
    function openCardDraft() {
        void flushCardAuthoringCleanup();
        setAuthoringJobId(null);
        setAuthoringReviewJob(null);
        authoringAttempt.current = null;
        cardAuthoringAction.reset();
        cardAutoSave.reset();
        setEditing('new');
    }

    function discardCardDraft() {
        void queueCardAuthoringCleanup();
        setConfirmCardDiscard(false);
        setCardDraftDirty(false);
        setEditing(null);
        setAuthoringJobId(null);
        setAuthoringReviewJob(null);
        authoringAttempt.current = null;
        cardAutoSave.reset();
    }

    function requestCloseCardDraft() {
        if (
            cardMutation.isPending ||
            cardAuthoringAction.isPending ||
            cardAutoSave.isPending
        )
            return;
        if (cardDraftDirty) setConfirmCardDiscard(true);
        else discardCardDraft();
    }

    return { discardCardDraft, requestCloseCardDraft, openCardDraft };
}
