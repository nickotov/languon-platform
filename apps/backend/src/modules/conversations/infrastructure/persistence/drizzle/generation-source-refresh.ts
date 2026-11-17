import {
    KnowledgeBodySchema,
    type KnowledgeNode,
    type ResolveGenerationRunSourceRequest,
} from '@languon/contracts';
import { and, eq } from 'drizzle-orm';
import { generationFingerprint } from '../../../application/generation-run-revisions';
import type { GenerationExecutionContext } from '../../../application/ports/generation-run';
import { knowledgeWorkingBranchesTable as branches } from '../../../../knowledge/infrastructure/persistence/drizzle/schema';
import { findProposalBlock } from './block-proposal-content';
import { conflict } from './conversation-persistence-context';
import type { ConversationsTransaction } from './conversation-source';
import {
    assertWorkspaceTurnContext,
    defaultWorkspaceContextLimits,
} from '../../../application/workspace-turn-context';
import { ConversationError } from '../../../domain/conversation';

function proseText(node: KnowledgeNode): string {
    if (node.type === 'learningBlock') {
        return '';
    }

    if (node.type === 'text') {
        return node.text ?? '';
    }

    return (node.content ?? [])
        .map(proseText)
        .join(node.type === 'doc' ? '\n' : '');
}

/** An unrelated editor change must not invalidate selected source evidence. */
export async function inspectGenerationSources(
    tx: ConversationsTransaction,
    noteId: string,
    branchId: string,
    context: GenerationExecutionContext,
) {
    const [branch] = await tx
        .select()
        .from(branches)
        .where(and(eq(branches.id, branchId), eq(branches.noteId, noteId)));

    if (!branch) {
        throw conflict('The document source is unavailable.');
    }

    const body = KnowledgeBodySchema.parse(branch.content.body);
    const text = proseText(body.document);
    const changed = new Set<string>();
    const unavailable = new Set<string>();
    const sources = context.sources.map((source) => {
        const ref = context.plan.sources.find(
            (item) => item.id === source.sourceId,
        )?.reference;

        if (ref?.kind === 'block') {
            const block = findProposalBlock(body.document, ref.blockId);
            if (!block) {
                changed.add(source.sourceId);
                unavailable.add(source.sourceId);

                return source;
            }

            const refreshed = { ...source, blocks: [block] };
            if (
                generationFingerprint(refreshed) !==
                generationFingerprint(source)
            ) {
                changed.add(source.sourceId);
            }

            return refreshed;
        }

        if (
            ref?.kind === 'selection' &&
            source.selection &&
            !text.includes(source.selection.text)
        ) {
            changed.add(source.sourceId);
            unavailable.add(source.sourceId);
        }

        return source;
    });

    return { sources, changed, unavailable };
}

/** Refresh a lost range only from a new explicit, owner-authorized editor capture. */
export function applyRefreshedGenerationSelection(
    context: GenerationExecutionContext,
    inspected: Awaited<ReturnType<typeof inspectGenerationSources>>,
    input: ResolveGenerationRunSourceRequest,
    target: { branchId: string; version: number },
) {
    if (!input.editorContext) {
        return inspected;
    }

    const editor = input.editorContext;
    assertWorkspaceTurnContext(
        {
            requestId: input.requestId,
            content: 'Refresh the selected lesson source.',
            attachments: [],
            editorContext: editor,
        },
        defaultWorkspaceContextLimits,
    );

    if (
        editor.workingBranch?.id !== target.branchId ||
        editor.workingBranch.version !== target.version
    ) {
        throw conflict(
            'Save the current editor and refresh its selected passage again.',
        );
    }

    if (
        !editor.selectedText?.trim() ||
        editor.editorTarget.originalText !== editor.selectedText
    ) {
        throw new ConversationError(
            'source_selection_required',
            'Select the current passage in the editor, then refresh the lesson sources.',
        );
    }

    const descriptor = context.plan.sources.find(
        (source) =>
            source.id === input.sourceId &&
            source.reference.kind === 'selection',
    );
    const captured =
        descriptor &&
        context.sources.find((source) => source.sourceId === descriptor.id)
            ?.selection;

    if (!captured) {
        throw conflict('This selected passage does not belong to the lesson.');
    }

    const sources = inspected.sources.map((source) => {
        // The same selected passage can feed several logical tasks under separate source IDs.
        if (
            !source.selection ||
            source.selection.noteId !== captured.noteId ||
            source.selection.noteVersion !== captured.noteVersion ||
            source.selection.text !== captured.text
        ) {
            return source;
        }

        inspected.changed.add(source.sourceId);
        inspected.unavailable.delete(source.sourceId);

        return {
            ...source,
            selection: {
                noteId: captured.noteId,
                noteVersion: target.version,
                text: editor.selectedText!,
                anchor: {
                    from: editor.editorTarget.from,
                    to: editor.editorTarget.to,
                    documentHash: editor.editorTarget.documentHash,
                },
            },
        };
    });

    return { ...inspected, sources };
}
