import type { EditorController, EditorWorkspace } from './editor-workspace';

export function createInterchangeViews(
    controller: EditorController,
    workspace: EditorWorkspace,
) {
    const importSheet = {
        t: controller.state.t,
        dictionaryId: controller.state.dictionaryId,
        interchangeOpen: controller.state.interchangeOpen,
        setInterchangeOpen: controller.state.setInterchangeOpen,
        interchangePreview: controller.state.interchangePreview,
        setInterchangePreview: controller.state.setInterchangePreview,
        generationCapabilities: controller.queries.generationCapabilities,
        interchangePreviewAction: controller.mutations.interchangePreviewAction,
        interchangeImportAction: controller.mutations.interchangeImportAction,
        current: workspace.current,
        catalog: workspace.catalog,
        currentVersions: workspace.currentVersions,
    };

    const exportSheet = {
        t: controller.state.t,
        interchangeOpen: controller.state.interchangeOpen,
        setInterchangeOpen: controller.state.setInterchangeOpen,
        interchangeExportAction: controller.mutations.interchangeExportAction,
    };

    return { importSheet, exportSheet };
}
