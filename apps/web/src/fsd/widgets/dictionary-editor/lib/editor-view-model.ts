import {
    deriveEditorWorkspace,
    type EditorController,
} from './editor-workspace';
import { createWorkspaceViews } from './editor-workspace-views';
import { createAuthoringViews } from './editor-authoring-views';
import { createGenerationViews } from './editor-generation-views';
import { createInterchangeViews } from './editor-interchange-views';

export function createEditorView(controller: EditorController) {
    const workspace = deriveEditorWorkspace(controller);
    return {
        active: workspace.current.lifecycle === 'active',
        workspace: createWorkspaceViews(controller, workspace),
        authoring: createAuthoringViews(controller, workspace),
        generation: createGenerationViews(controller, workspace),
        interchange: createInterchangeViews(controller, workspace),
    };
}
