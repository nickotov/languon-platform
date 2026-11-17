import type { ConversationEditorContext } from '@languon/contracts';
import type { WorkspaceAssistantProps } from '../types';
import { hashEditorContent } from './hash-editor-content';

/** Capture the actual editor selection; a stale chat attachment cannot authorize replacement. */
export async function captureGenerationSource(
    workspace: WorkspaceAssistantProps,
): Promise<ConversationEditorContext | undefined> {
    const snapshot = workspace.getSnapshot();
    const workingBranch = await workspace.beforeSend?.();
    const originalText = snapshot.editorTarget.originalText;
    if (!originalText.trim() || !workingBranch) {
        return undefined;
    }

    const current = workspace.getSnapshot(snapshot.targetId);
    if (
        current.content !== snapshot.content ||
        current.editorTarget.from !== snapshot.editorTarget.from ||
        current.editorTarget.to !== snapshot.editorTarget.to ||
        current.editorTarget.originalText !== originalText
    ) {
        throw new Error(
            'The document selection changed while preparing this request.',
        );
    }

    const documentHash = await hashEditorContent(snapshot.content);

    return {
        workingBranch,
        content: snapshot.content,
        selectedText: originalText,
        editorTarget: { ...snapshot.editorTarget, documentHash },
    };
}
