import {
    TextLanguageSchema,
    type TextDocument,
    type TextTranslationProposal,
} from '@languon/contracts';
import { workspaceEdits } from './workspace-boundaries';
import { textsApi, type RequestWithTextSession } from '@/fsd/entities/texts';
import {
    workspaceTitle,
    type WorkspaceInput,
    type WorkspacePair,
} from './workspace-content';
export async function persistWorkspace(options: {
    request: RequestWithTextSession;
    folderId: string;
    document: TextDocument | null;
    input: WorkspaceInput;
    proposal: TextTranslationProposal | null;
    pairs: WorkspacePair[];
    editing: boolean;
    reviewedVersion: number | null;
    operationId?: string;
    onCreated(document: TextDocument): void;
}) {
    const {
        request,
        folderId,
        document,
        input,
        proposal,
        pairs,
        editing,
        reviewedVersion,
        onCreated,
        operationId,
    } = options;
    let current = document;
    const content = {
        sourceText: input.sourceText,
        sourceLanguage: TextLanguageSchema.parse(input.sourceLanguage),
        targetLanguage: TextLanguageSchema.parse(input.targetLanguage),
    };
    if (!current) {
        current = (
            await request((token) =>
                textsApi.createText(token, {
                    folderId,
                    ...(operationId ? { operationId } : {}),
                    title: workspaceTitle(input),
                    ...content,
                }),
            )
        ).text;
        onCreated(current);
    }
    if (proposal) {
        try {
            return (
                await request((token) =>
                    textsApi.saveText(token, current.id, {
                        kind: 'proposal',
                        jobId: proposal.id,
                        expectedVersion: current.version,
                        title: workspaceTitle(input),
                    }),
                )
            ).text;
        } catch (cause) {
            try {
                const latest = (
                    await request((token) =>
                        textsApi.getText(token, current.id),
                    )
                ).text;
                if (
                    latest.version === current.version + 1 &&
                    latest.title === workspaceTitle(input) &&
                    latest.sourceText === proposal.sourceText &&
                    latest.sourceLanguage === proposal.sourceLanguage &&
                    latest.targetLanguage === proposal.targetLanguage &&
                    JSON.stringify(latest.alignment) ===
                        JSON.stringify(proposal.alignment)
                )
                    return latest;
            } catch {
                /* Keep the original failure and proposal available for retry. */
            }
            throw cause;
        }
    }
    if (editing)
        return (
            await request((token) =>
                textsApi.saveText(token, current.id, {
                    kind: 'edits',
                    expectedVersion: reviewedVersion ?? current.version,
                    pairs: workspaceEdits(current, pairs),
                }),
            )
        ).text;
    if (document)
        return (
            await request((token) =>
                textsApi.saveText(token, current.id, {
                    kind: 'draft',
                    expectedVersion: reviewedVersion ?? current.version,
                    title: workspaceTitle(input),
                    ...content,
                }),
            )
        ).text;
    return current;
}
