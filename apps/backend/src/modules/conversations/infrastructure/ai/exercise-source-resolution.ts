import { z } from 'zod';
import type { LearningBlock } from '@languon/contracts';
import type { TutorRunInput } from '../../application/ports/tutor-runner';
import type { LearningContentBrief } from '../../application/learning-content-contract';
import {
    frozenTutorTextSources,
    readFrozenLearningBlocks,
} from '../../application/tutor-request-sources';
import { tutorMessageModelContent } from '../../application/tutor-message-context';
import type { ExerciseAuthoringSource } from './exercise-authoring-context';
import type { TutorRequestState } from '../../application/tutor-request-contract';

const references = z.array(z.uuid()).max(8);
const catalog = z.array(z.object({ id: z.uuid() }).passthrough()).max(100);

/** Context is reconstructed from this claimed operation, never model-authored snapshots. */
export async function resolveExerciseSourceContexts(
    input: Pick<TutorRunInput, 'message'> &
        Partial<
            Pick<TutorRunInput, 'sourceContext' | 'readContext' | 'sourceNote'>
        >,
    brief: LearningContentBrief,
    proposals: ReadonlyMap<string, readonly LearningBlock[]> = new Map(),
    contexts: Map<string, ExerciseAuthoringSource> = new Map(),
    selectedProposalIds: readonly string[] = [],
) {
    const frozen = frozenTutorTextSources(input);
    const mentioned = references.safeParse(
        tutorMessageModelContent(input.message).blockReferences,
    );
    const explicit = mentioned.success ? mentioned.data : [];
    const sourceContext = input.sourceContext ?? {};
    const available = catalog.safeParse(sourceContext.availableBlocks);
    const allIds = available.success
        ? available.data.map((block) => block.id)
        : [];
    const reads = new Map<string, Promise<LearningBlock[]>>();
    const readBlocks = (ids: string[]) => {
        if (!input.readContext) {
            throw new Error('The exact source reader is unavailable.');
        }

        const key = [...ids].sort().join(',');
        let read = reads.get(key);
        if (!read) {
            read = readFrozenLearningBlocks(
                { readContext: input.readContext },
                ids,
            );

            reads.set(key, read);
        }

        return read;
    };

    for (const task of brief.tasks) {
        if (
            (task.kind !== 'exercises' &&
                !(task.source?.kind === 'editor' && task.source.blockId)) ||
            task.source?.kind === 'task'
        ) {
            continue;
        }

        if (contexts.has(task.id)) {
            const retained = contexts.get(task.id)!;
            const local = retained.blocks.filter(
                (block) =>
                    !retained.proposalId &&
                    !retained.proposalIds?.has(block.id),
            );

            if (local.length) {
                // Keep original values, but do not author a local reference that
                // can no longer exist in the destination document.
                const current = await readBlocks(
                    local.map((block) => block.id),
                );

                for (const source of local) {
                    const live = current.find(
                        (block) => block.id === source.id,
                    );

                    if (
                        !live ||
                        live.type !== source.type ||
                        (source.type === 'vocabulary' &&
                            live.type === 'vocabulary' &&
                            source.entries.some(
                                (entry) =>
                                    !live.entries.some(
                                        (item) => item.id === entry.id,
                                    ),
                            )) ||
                        (source.type === 'bilingual-text' &&
                            live.type === 'bilingual-text' &&
                            source.segments.some(
                                (segment) =>
                                    !live.segments.some(
                                        (item) => item.id === segment.id,
                                    ),
                            ))
                    ) {
                        throw new Error(
                            'The pending local source changed or is unavailable. Select it again.',
                        );
                    }
                }
            }

            continue;
        }

        if (!task.source && selectedProposalIds.length) {
            const blocks: LearningBlock[] = [];
            const proposalIds = new Map<string, string>();
            for (const proposalId of selectedProposalIds) {
                const selected = proposals.get(proposalId);
                if (!selected?.length) {
                    throw new Error(
                        'The selected learning proposal is unavailable.',
                    );
                }

                for (const block of selected) {
                    if (proposalIds.has(block.id)) {
                        throw new Error(
                            'Choose one exact version of each source block.',
                        );
                    }

                    blocks.push(block);
                    proposalIds.set(block.id, proposalId);
                }
            }

            contexts.set(task.id, { blocks, proposalIds });
            continue;
        }

        if (task.source?.kind === 'proposal') {
            const source = task.source;
            const blocks = proposals
                .get(source.proposalId)
                ?.filter(
                    (block) => !source.blockId || block.id === source.blockId,
                );

            if (!blocks?.length) {
                throw new Error(
                    'The exact selected learning proposal is unavailable.',
                );
            }

            contexts.set(task.id, { blocks, proposalId: source.proposalId });
            continue;
        }

        const selectedText =
            task.source?.kind === 'selection' ? frozen.selection : undefined;

        if (task.source?.kind === 'selection' && !selectedText) {
            throw new Error(
                'The selected passage is unavailable. Select it again.',
            );
        }

        if (selectedText) {
            if (!input.sourceNote) {
                throw new Error(
                    'The selected passage has no authorized source identity.',
                );
            }

            contexts.set(task.id, {
                blocks: [],
                selection: { ...input.sourceNote, text: selectedText },
            });

            continue;
        }

        const blockId =
            task.source?.kind === 'editor' ? task.source.blockId : undefined;

        if (
            !available.success &&
            sourceContext.availableBlocks !== undefined &&
            !blockId &&
            !explicit.length
        ) {
            throw new Error(
                'Select at most eight exact source blocks for the exercises.',
            );
        }

        if (blockId && explicit.length && !explicit.includes(blockId)) {
            throw new Error(
                'The requested source differs from the selected learning blocks.',
            );
        }

        const ids = blockId ? [blockId] : explicit.length ? explicit : allIds;
        if (
            ids.length > 8 ||
            (!blockId &&
                !explicit.length &&
                sourceContext.blockCatalogComplete === false)
        ) {
            throw new Error(
                'Select at most eight exact source blocks for the exercises.',
            );
        }

        if (ids.length) {
            const blocks = await readBlocks(ids);

            contexts.set(task.id, { blocks });
        } else if (frozen.editor && input.sourceNote) {
            contexts.set(task.id, {
                blocks: [],
                selection: { ...input.sourceNote, text: frozen.editor },
            });
        } else {
            contexts.set(task.id, { blocks: [] });
        }
    }

    return contexts;
}

export function exerciseGroundingSources(
    contexts: ReadonlyMap<string, ExerciseAuthoringSource>,
) {
    return new Map(
        [...contexts].map(([taskId, context]) => [
            taskId,
            {
                blocks: context.blocks,
                ...(context.selection ? { text: context.selection.text } : {}),
            },
        ]),
    );
}

/** Persist identities/metadata once; selected prose stays in the grounded pending brief. */
export function storePendingExerciseSources(
    contexts: ReadonlyMap<string, ExerciseAuthoringSource>,
) {
    const blocks = new Map<string, LearningBlock>();
    const tasks = [...contexts].map(([taskId, context]) => {
        for (const block of context.blocks) {
            const existing = blocks.get(block.id);
            if (
                existing &&
                JSON.stringify(existing) !== JSON.stringify(block)
            ) {
                throw new Error(
                    'Choose one exact source version before continuing.',
                );
            }

            blocks.set(block.id, block);
        }

        const proposalOrigins = context.proposalIds
            ? [...context.proposalIds].map(([blockId, proposalId]) => ({
                  blockId,
                  proposalId,
              }))
            : context.proposalId
              ? context.blocks.map((block) => ({
                    blockId: block.id,
                    proposalId: context.proposalId!,
                }))
              : [];
        const selectionOrigin = context.selection
            ? {
                  noteId: context.selection.noteId,
                  noteVersion: context.selection.noteVersion,
              }
            : undefined;

        return {
            taskId,
            blockIds: context.blocks.map((block) => block.id),
            ...(proposalOrigins.length ? { proposalOrigins } : {}),
            ...(selectionOrigin ? { selectionOrigin } : {}),
        };
    });

    return { blocks: [...blocks.values()], tasks };
}

/** Only host-captured pending sources survive a clarification; current editor text cannot replace them. */
export function restorePendingExerciseSources(
    state: TutorRequestState,
    requested: LearningContentBrief,
) {
    const result = new Map<string, ExerciseAuthoringSource>();
    for (const saved of state.pendingSources?.tasks ?? []) {
        const original = state.pending?.tasks.find(
            (task) => task.id === saved.taskId,
        );
        const task = requested.tasks.find((task) => task.id === saved.taskId);
        if (
            !task ||
            !original ||
            JSON.stringify(task.source) !== JSON.stringify(original.source) ||
            task.sourceText !== original.sourceText
        ) {
            continue;
        }

        const blocks = saved.blockIds.map((blockId) =>
            state.pendingSources!.blocks.find((block) => block.id === blockId),
        );

        if (
            blocks.some((block) => !block) ||
            (saved.selectionOrigin && !original.sourceText)
        ) {
            throw new Error(
                'The captured pending source is unavailable. Select it again.',
            );
        }

        result.set(task.id, {
            blocks: blocks as LearningBlock[],
            ...(saved.proposalOrigins
                ? {
                      proposalIds: new Map(
                          saved.proposalOrigins.map((origin) => [
                              origin.blockId,
                              origin.proposalId,
                          ]),
                      ),
                  }
                : {}),
            ...(saved.selectionOrigin
                ? {
                      selection: {
                          ...saved.selectionOrigin,
                          text: original.sourceText!,
                      },
                  }
                : {}),
        });
    }

    return result;
}
