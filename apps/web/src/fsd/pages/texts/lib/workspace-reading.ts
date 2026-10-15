import type { TextDocument, TextSelectionSource } from '@languon/contracts';
import type { TextWorkspace } from '../hooks/use-text-workspace';
export function workspaceReadingDocument(ws: TextWorkspace) {
    const proposal = ws.proposal;
    let readingDocument: Pick<
        TextDocument,
        | 'id'
        | 'sourceLanguage'
        | 'targetLanguage'
        | 'sourceText'
        | 'alignment'
        | 'status'
        | 'version'
    > | null = ws.document;
    let readingSource: TextSelectionSource | null = null;
    if (proposal) {
        readingDocument = {
            id: ws.document?.id ?? proposal.id,
            version: ws.document?.version ?? 1,
            sourceText: proposal.sourceText,
            sourceLanguage: proposal.sourceLanguage,
            targetLanguage: proposal.targetLanguage,
            alignment: proposal.alignment,
            status: 'translated',
        };
        readingSource = { kind: 'translation-proposal', jobId: proposal.id };
    } else if (ws.document) {
        readingSource = {
            kind: 'owned-text',
            textId: ws.document.id,
            expectedTextVersion: ws.document.version,
        };
    }
    return { readingDocument, readingSource };
}
