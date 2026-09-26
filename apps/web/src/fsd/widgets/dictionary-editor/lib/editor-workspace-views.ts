import type { EditorController, EditorWorkspace } from './editor-workspace';

export function createWorkspaceViews(
    controller: EditorController,
    workspace: EditorWorkspace,
) {
    const summary = {
        current: workspace.current,
        catalog: workspace.catalog,
        locale: controller.state.locale,
        t: controller.state.t,
        href: controller.state.href,
        setSettingsOpen: controller.state.setSettingsOpen,
    };

    const feedback = {
        t: controller.state.t,
        conflict: workspace.conflict,
        mutationError: workspace.mutationError,
        reloadAfterConflict: workspace.reloadAfterConflict,
        outcome: controller.state.outcome,
        generationCapabilities: controller.queries.generationCapabilities,
    };

    const toolbar = {
        t: controller.state.t,
        cardLifecycle: controller.state.cardLifecycle,
        setCardLifecycle: controller.state.setCardLifecycle,
        search: controller.state.search,
        setSearch: controller.state.setSearch,
        current: workspace.current,
    };

    const cards = {
        t: controller.state.t,
        current: workspace.current,
        catalog: workspace.catalog,
        cardList: workspace.cardList,
        cards: controller.queries.cards,
        cardLifecycle: controller.state.cardLifecycle,
        generationCapabilities: controller.queries.generationCapabilities,
        audio: controller.queries.audio,
        setEditing: controller.state.setEditing,
        setGenerationTarget: controller.state.setGenerationTarget,
        setGenerationCompared: controller.state.setGenerationCompared,
        generationAction: controller.mutations.generationAction,
        cardLifecycleMutation: controller.mutations.cardLifecycleMutation,
        cardMutation: controller.mutations.cardMutation,
        cardDeletion: controller.mutations.cardDeletion,
        reorder: controller.mutations.reorder,
        cardsQueryKey: controller.state.cardsQueryKey,
        queryClient: controller.state.queryClient,
    };

    const addCard = {
        t: controller.state.t,
        cardMutation: controller.mutations.cardMutation,
        openCardDraft: controller.draftActions.openCardDraft,
    };

    const secondaryActions = {
        t: controller.state.t,
        current: workspace.current,
        generationCapabilities: controller.queries.generationCapabilities,
        setSharingOpen: controller.state.setSharingOpen,
        setInterchangePreview: controller.state.setInterchangePreview,
        interchangePreviewAction: controller.mutations.interchangePreviewAction,
        interchangeImportAction: controller.mutations.interchangeImportAction,
        interchangeExportAction: controller.mutations.interchangeExportAction,
        setInterchangeOpen: controller.state.setInterchangeOpen,
        setBatchGenerationJobId: controller.state.setBatchGenerationJobId,
        setBatchGenerationOpen: controller.state.setBatchGenerationOpen,
        batchGenerationAction: controller.mutations.batchGenerationAction,
        setDocumentGenerationJobId: controller.state.setDocumentGenerationJobId,
        setDocumentGenerationOpen: controller.state.setDocumentGenerationOpen,
        documentGenerationAction: controller.mutations.documentGenerationAction,
    };

    const emptyCards = {
        t: controller.state.t,
        current: workspace.current,
        search: controller.state.search,
        cardLifecycle: controller.state.cardLifecycle,
        setSearch: controller.state.setSearch,
        openCardDraft: controller.draftActions.openCardDraft,
    };

    return {
        summary: { ...summary, secondaryActions },
        feedback,
        toolbar,
        cards: { ...cards, emptyState: emptyCards },
        addCard,
    };
}
