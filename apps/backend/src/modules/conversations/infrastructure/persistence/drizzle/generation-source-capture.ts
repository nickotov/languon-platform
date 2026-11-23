import { LearningBlockSchema, type GenerationPlan } from '@languon/contracts';
import { z } from 'zod';
import type { ClaimedConversationTurn } from '../../../application/ports/conversation-store';
import type { GenerationSourceSnapshot } from '../../../application/ports/generation-run';
import { conflict } from './conversation-persistence-context';

const sourceSchema = z
    .object({
        sourceId: z.string().min(1).max(80),
        blocks: z.array(LearningBlockSchema).max(25),
        selection: z
            .object({
                noteId: z.uuid(),
                noteVersion: z.number().int().nonnegative(),
                anchor: z
                    .object({
                        from: z.number().int().nonnegative(),
                        to: z.number().int().nonnegative(),
                        documentHash: z.string().regex(/^[a-f0-9]{64}$/u),
                    })
                    .strict()
                    .optional(),
                text: z.string().min(1).max(40_000),
            })
            .strict()
            .optional(),
        proposalId: z.uuid().optional(),
        providedText: z
            .object({
                materialId: z.uuid(),
                text: z.string().min(1).max(40_000),
            })
            .strict()
            .optional(),
    })
    .strict();

/** Bind untrusted plan references to the sources captured by the authorized worker. */
export function captureGenerationSources(
    turn: ClaimedConversationTurn,
    plan: GenerationPlan,
    evidence: GenerationSourceSnapshot[],
): GenerationSourceSnapshot[] {
    const sources = sourceSchema
        .array()
        .max(32)
        .parse(evidence)
        .map((source) => {
            const anchor = turn.message.editorTarget;
            if (
                !source.selection ||
                !anchor ||
                anchor.originalText !== source.selection.text
            ) {
                return source;
            }

            return {
                ...source,
                selection: {
                    ...source.selection,
                    anchor: {
                        from: anchor.from,
                        to: anchor.to,
                        documentHash: anchor.documentHash,
                    },
                },
            };
        });

    if (
        sources.length !== plan.sources.length ||
        plan.sources.some(
            (source) =>
                !sources.some((snapshot) => snapshot.sourceId === source.id),
        )
    ) {
        throw conflict('The plan source evidence is incomplete.');
    }

    if (JSON.stringify(sources).length > 160_000) {
        throw conflict('The plan source evidence is too large.');
    }

    for (const descriptor of plan.sources) {
        const source = sources.find((item) => item.sourceId === descriptor.id)!;
        const reference = descriptor.reference;
        const expectedType =
            descriptor.kind === 'text' ? 'bilingual-text' : descriptor.kind;
        const matches =
            reference.kind === 'selection'
                ? source.blocks.length === 0 &&
                  source.selection?.noteId === turn.source.id
                : reference.kind === 'provided-text'
                  ? source.blocks.length === 0 &&
                    source.providedText?.materialId === reference.materialId
                  : source.blocks.length === 1 &&
                    source.blocks[0]?.id === reference.blockId &&
                    source.blocks[0]?.type === expectedType &&
                    (reference.kind !== 'proposal' ||
                        source.proposalId === reference.proposalId);

        const block = source.blocks[0];
        if (
            !matches ||
            (descriptor.kind === 'audio' &&
                (block?.type !== 'audio' ||
                    !block.assetId ||
                    !block.transcript?.segments.length))
        ) {
            throw conflict(
                'The captured source does not match the authorized plan reference.',
            );
        }
    }

    return sources;
}
