import { bodyBlocks } from './learning-generation-plan';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { LearningBlock } from '@languon/contracts';
import {
    LearningContentBriefSchema,
    type LearningContentBrief,
    type LearningContentResult,
} from '../../application/learning-content-contract';
import type { TutorRunInput } from '../../application/ports/tutor-runner';
import type { LearningContentAuthoring } from './learning-content-authoring';

export const LearningContentReceiptSchema = z
    .object({
        proposalId: z.uuid(),
        summary: z.string().min(1).max(2_000),
        content: z
            .array(
                z
                    .object({
                        kind: z.string(),
                        title: z.string().optional(),
                        count: z.number().int().positive(),
                        language: z.string().optional(),
                        translationLanguage: z.string().optional(),
                    })
                    .strict(),
            )
            .min(1)
            .max(25),
        requiresLearnerApply: z.literal(true),
    })
    .strict();

export type LearningContentReceipt = z.infer<
    typeof LearningContentReceiptSchema
>;
export type LearningContentOperationResult =
    | { status: 'ready'; receipt: LearningContentReceipt }
    | Exclude<LearningContentResult, { status: 'ready' }>;

function describeBlock(block: LearningBlock) {
    return {
        kind: block.type,
        ...(block.title ? { title: block.title } : {}),
        count: block.type === 'vocabulary' ? block.entries.length : 1,
        ...('language' in block ? { language: block.language } : {}),
        ...('translationLanguage' in block
            ? { translationLanguage: block.translationLanguage }
            : {}),
    };
}

/** One operation owns authoring and one publication; no singleton-tool loop can publish partial material. */
export function createLearningContentOperations(options: {
    authoring: LearningContentAuthoring;
    publish: NonNullable<TutorRunInput['onContentProposal']>;
    signal: AbortSignal;
    onTool?: TutorRunInput['onTool'];
    resolveSources?: (
        brief: LearningContentBrief,
    ) => Promise<LearningContentBrief>;
}) {
    const attempts = new Map<string, Promise<LearningContentOperationResult>>();
    let active: string | undefined;

    async function perform(
        candidate: unknown,
    ): Promise<LearningContentOperationResult> {
        options.signal.throwIfAborted();
        let brief = LearningContentBriefSchema.parse(candidate);
        const sourceTasks = brief.tasks.filter((task) => task.source);
        if (sourceTasks.length) {
            if (!options.resolveSources) {
                active = undefined;

                return {
                    status: 'needs-clarification',
                    missing: sourceTasks.map((task) => ({
                        taskId: task.id,
                        fields: ['sourceText'],
                    })),
                };
            }

            try {
                brief = LearningContentBriefSchema.parse(
                    await options.resolveSources(brief),
                );
            } catch {
                options.signal.throwIfAborted();
                active = undefined;

                return {
                    status: 'needs-clarification',
                    missing: sourceTasks.map((task) => ({
                        taskId: task.id,
                        fields: ['sourceText'],
                    })),
                };
            }
        }

        const result = await options.authoring.generate(brief, options.signal);

        if (result.status !== 'ready') {
            active = undefined;

            return result;
        }

        const receipt = await publishLearningProposal(
            options,
            result.proposal,
            result.summary,
            result.validatedCallIds,
        );

        return { status: 'ready', receipt };
    }

    return {
        generateAndPropose(
            candidate: unknown,
        ): Promise<LearningContentOperationResult> {
            const parsed = LearningContentBriefSchema.safeParse(candidate);
            if (!parsed.success) {
                return Promise.resolve({
                    status: 'failed',
                    reason: 'invalid-brief',
                });
            }

            const key = JSON.stringify(parsed.data);
            const previous = attempts.get(key);
            if (previous) {
                return previous;
            }

            if (active !== undefined) {
                throw new Error(
                    'A complete learning proposal is already being prepared for this operation.',
                );
            }

            active = key;
            const result = perform(parsed.data);
            attempts.set(key, result);

            return result;
        },
    };
}

/** The sole lifecycle wrapper for validated canonical block-proposal writes. */
export async function publishLearningProposal(
    options: {
        publish: NonNullable<TutorRunInput['onContentProposal']>;
        signal: AbortSignal;
        onTool?: TutorRunInput['onTool'];
    },
    proposal: Parameters<NonNullable<TutorRunInput['onContentProposal']>>[0],
    summary: string,
    validationIds?: string[],
): Promise<LearningContentReceipt> {
    const receipts = await publishLearningProposals(
        {
            ...options,
            publish: async (proposals, ids) => [
                ...(ids?.length
                    ? [await options.publish(proposals[0]!, ids)]
                    : [await options.publish(proposals[0]!)]),
            ],
        },
        [{ proposal, summary }],
        validationIds,
    );

    return receipts[0]!;
}

/** One publication boundary owns the entire validated revision cohort. */
export async function publishLearningProposals(
    options: {
        publish: NonNullable<TutorRunInput['onContentBatch']>;
        signal: AbortSignal;
        onTool?: TutorRunInput['onTool'];
    },
    entries: {
        proposal: Parameters<
            NonNullable<TutorRunInput['onContentProposal']>
        >[0];
        summary: string;
    }[],
    validationIds?: string[],
): Promise<LearningContentReceipt[]> {
    options.signal.throwIfAborted();
    const callId = randomUUID();
    await options.onTool?.({
        id: callId,
        name: 'propose_learning_content',
        state: 'running',
    });

    try {
        const proposals = entries.map((entry) => entry.proposal);
        const persisted = validationIds?.length
            ? await options.publish(proposals, validationIds)
            : await options.publish(proposals);

        options.signal.throwIfAborted();
        if (persisted.length !== entries.length) {
            throw new Error(
                'Atomic publication did not return the complete proposal set.',
            );
        }

        const receipts = entries.map((entry, index) =>
            LearningContentReceiptSchema.parse({
                proposalId: persisted[index]!.id,
                summary: entry.summary,
                content: [
                    ...bodyBlocks(entry.proposal.body).map(describeBlock),
                    ...((entry.proposal.body.document.content ?? []).some(
                        (node) => node.type !== 'learningBlock',
                    )
                        ? [{ kind: 'prose', count: 1 }]
                        : []),
                ],
                requiresLearnerApply: true,
            }),
        );

        await options.onTool?.({
            id: callId,
            name: 'propose_learning_content',
            state: 'succeeded',
        });

        return receipts;
    } catch (error) {
        await options.onTool?.({
            id: callId,
            name: 'propose_learning_content',
            state: 'failed',
        });

        throw error;
    }
}
