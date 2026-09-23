import type { EditorController, EditorWorkspace } from './editor-workspace';

export function createAuthoringViews(
    controller: EditorController,
    workspace: EditorWorkspace,
) {
    const cardSheet = {
        t: controller.state.t,
        locale: controller.state.locale,
        setCardDraftDirty: controller.state.setCardDraftDirty,
        editing: controller.state.editing,
        authoringReviewJob: controller.state.authoringReviewJob,
        generationCapabilities: controller.queries.generationCapabilities,
        authoringJob: controller.jobs.authoringJob,
        cardMutation: controller.mutations.cardMutation,
        cardAuthoringAction: controller.mutations.cardAuthoringAction,
        requestCloseCardDraft: controller.draftActions.requestCloseCardDraft,
        current: workspace.current,
        catalog: workspace.catalog,
        cardList: workspace.cardList,
        reloadAfterConflict: workspace.reloadAfterConflict,
    };

    const discardDialog = {
        t: controller.state.t,
        confirmCardDiscard: controller.state.confirmCardDiscard,
        setConfirmCardDiscard: controller.state.setConfirmCardDiscard,
        discardCardDraft: controller.draftActions.discardCardDraft,
    };

    const settingsSheet = {
        t: controller.state.t,
        locale: controller.state.locale,
        settingsOpen: controller.state.settingsOpen,
        setSettingsOpen: controller.state.setSettingsOpen,
        updateSettings: controller.mutations.updateSettings,
        current: workspace.current,
        catalog: workspace.catalog,
    };

    const sharingSheet = {
        t: controller.state.t,
        sharingOpen: controller.state.sharingOpen,
        setSharingOpen: controller.state.setSharingOpen,
        share: controller.mutations.share,
        current: workspace.current,
    };

    return { cardSheet, discardDialog, settingsSheet, sharingSheet };
}
