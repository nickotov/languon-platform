import type { EditorController, EditorWorkspace } from './editor-workspace';

export function createGenerationViews(
    controller: EditorController,
    workspace: EditorWorkspace,
) {
    const generationReview = {
        t: controller.state.t,
        generationTarget: controller.state.generationTarget,
        setGenerationTarget: controller.state.setGenerationTarget,
        generationCompared: controller.state.generationCompared,
        setGenerationCompared: controller.state.setGenerationCompared,
        dictionary: controller.queries.dictionary,
        cards: controller.queries.cards,
        generationCapabilities: controller.queries.generationCapabilities,
        generationJob: controller.jobs.generationJob,
        generationCard: controller.jobs.generationCard,
        generationAction: controller.mutations.generationAction,
        current: workspace.current,
        catalog: workspace.catalog,
        generationConflict: workspace.generationConflict,
    };

    const batchSheet = {
        t: controller.state.t,
        batchGenerationOpen: controller.state.batchGenerationOpen,
        setBatchGenerationOpen: controller.state.setBatchGenerationOpen,
        batchGenerationJobId: controller.state.batchGenerationJobId,
        setBatchGenerationJobId: controller.state.setBatchGenerationJobId,
        dictionary: controller.queries.dictionary,
        cards: controller.queries.cards,
        generationCapabilities: controller.queries.generationCapabilities,
        batchGenerationJob: controller.jobs.batchGenerationJob,
        batchGenerationAction: controller.mutations.batchGenerationAction,
        current: workspace.current,
        catalog: workspace.catalog,
    };

    const documentSheet = {
        t: controller.state.t,
        documentGenerationOpen: controller.state.documentGenerationOpen,
        setDocumentGenerationOpen: controller.state.setDocumentGenerationOpen,
        documentGenerationJobId: controller.state.documentGenerationJobId,
        setDocumentGenerationJobId: controller.state.setDocumentGenerationJobId,
        dictionary: controller.queries.dictionary,
        cards: controller.queries.cards,
        generationCapabilities: controller.queries.generationCapabilities,
        documentGenerationJob: controller.jobs.documentGenerationJob,
        documentGenerationAction: controller.mutations.documentGenerationAction,
        current: workspace.current,
        catalog: workspace.catalog,
    };

    return { generationReview, batchSheet, documentSheet };
}
