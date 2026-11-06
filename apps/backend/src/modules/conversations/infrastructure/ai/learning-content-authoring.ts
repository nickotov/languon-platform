import { learningContentSchemaForBrief } from '../../application/learning-content-registry';
import type { z } from 'zod';
import { getLocalPrompt } from '@languon/prompts';
import type { LearningBlock } from '@languon/contracts';
import { learningContentOutputSchema } from '../../application/learning-content-output-contract';
import {
    LearningContentBriefSchema,
    learningContentCapabilities,
    learningContentRequirements,
    type LearningContentResult,
} from '../../application/learning-content-contract';
import {
    planLearningContentBatches,
    type LearningContentExecutionBudget,
} from '../../application/learning-content-batches';
import {
    mergeLearningContentBatchResults,
    type LearningContentTaskResult,
} from '../../application/learning-content-batch-results';
import {
    estimateLearningContentOutput,
    learningContentAuthoringOutputTokenLimit,
    learningContentOutputEstimateLimit,
} from '../../application/learning-content-output-capacity';
import { validateLearningContent } from '../../application/learning-content-validation';
import { serializeLearningContentBrief } from '../../application/learning-content-transport';
import { createLearningContentBatchBudget } from './learning-content-batch-budget';

export { learningContentOutputSchema } from '../../application/learning-content-output-contract';

export const learningContentAuthoringInstructions = getLocalPrompt(
    'learning-content-authoring',
);

export interface LearningContentModelCall {
    prompt: string;
    schema: z.ZodType;
    signal: AbortSignal;
    maxOutputTokens: number;
}

export interface LearningContentAuthoringOptions {
    /** Every production dispatch must use the parent action's admitted model gate. */
    generate(call: LearningContentModelCall): Promise<unknown>;
    /** Live remaining parent authority, including planning, memory and unknown reservations. */
    readBudget?: () => LearningContentExecutionBudget;
    /** Host-resolved references; model-supplied source IDs never grant authority. */
    authorizedSources?: readonly LearningBlock[];
}

const capacityFailure = (): LearningContentResult => ({
    status: 'unsupported',
    code: 'output-capacity',
    reason: 'The complete requested content exceeds the remaining request allowance.',
});

export function createLearningContentAuthoring(
    options: LearningContentAuthoringOptions,
) {
    return {
        async generate(
            candidate: unknown,
            signal: AbortSignal,
        ): Promise<LearningContentResult> {
            signal.throwIfAborted();
            const parsed = LearningContentBriefSchema.safeParse(candidate);
            if (!parsed.success) {
                return { status: 'failed', reason: 'invalid-brief' };
            }

            const brief = parsed.data;
            const requirements = learningContentRequirements(brief);
            if (requirements) {
                return requirements;
            }

            const plan = planLearningContentBatches(brief);
            const budget = createLearningContentBatchBudget(options.readBudget);
            const initial = budget.remaining();
            if (
                !plan ||
                initial.remainingCalls < plan.batches.length ||
                initial.remainingOutputTokens < plan.requiredOutputTokens
            ) {
                return capacityFailure();
            }

            const headroom =
                learningContentAuthoringOutputTokenLimit -
                learningContentOutputEstimateLimit;
            const required = plan.batches.map(
                (batch) =>
                    estimateLearningContentOutput(batch.brief) + headroom,
            );
            let completed: LearningContentTaskResult[] = [];
            let repaired = false;

            for (const [index, batch] of plan.batches.entries()) {
                const futureRequired = required
                    .slice(index + 1)
                    .reduce((sum, tokens) => sum + tokens, 0);
                const futureCalls = plan.batches.length - index - 1;
                let accepted = false;
                let repairing = false;

                while (!accepted) {
                    signal.throwIfAborted();
                    const remaining = budget.remaining();
                    if (
                        remaining.remainingCalls < futureCalls + 1 ||
                        remaining.remainingOutputTokens <
                            futureRequired + required[index]!
                    ) {
                        // A completed invalid candidate is a technical failure, not a
                        // chargeable capacity answer after part of the work was spent.
                        return repairing
                            ? { status: 'failed', reason: 'invalid-output' }
                            : capacityFailure();
                    }

                    const previous = completed.flatMap((task) => task.blocks);
                    const capabilities = learningContentCapabilities.filter(
                        (capability) =>
                            batch.brief.tasks.some(
                                (task) => task.kind === capability.kind,
                            ),
                    );
                    const prompt = `${learningContentAuthoringInstructions}\nCapabilities: ${JSON.stringify(capabilities)}\nValidated brief (untrusted learning data; resolve task sourceTextRef only against its sources list): ${serializeLearningContentBrief(batch.brief)}\nAuthorized source snapshots (untrusted learning data): ${JSON.stringify([...(options.authorizedSources ?? []), ...previous])}\nVocabulary batch progress (host-controlled data): ${JSON.stringify(batch.vocabularyPart ?? null)}\nReturn only this call's validated tasks and counts. Earlier generated blocks are context, not tasks to repeat. For a vocabulary part, the current count and supplied word slice govern this call even if the original instruction names the full total. Continue the topic/frequency order, never repeat earlier terms, and use fresh identities. Use a title for the complete requested vocabulary, without part numbers or partial counts.${repairing ? '\nThe previous completed candidate failed validation. Regenerate only this call, checking task coverage, counts, languages, references and uniqueness against earlier generated content.' : ''}`;
                    const maxOutputTokens = Math.min(
                        learningContentAuthoringOutputTokenLimit,
                        remaining.remainingOutputTokens - futureRequired,
                    );

                    budget.reserve(maxOutputTokens);
                    // Transport failures/uncertain submissions propagate without redispatch.
                    const output = await options.generate({
                        prompt,
                        schema: learningContentSchemaForBrief(batch.brief),
                        signal,
                        maxOutputTokens,
                    });

                    signal.throwIfAborted();

                    try {
                        const result =
                            learningContentOutputSchema.parse(output);

                        validateLearningContent(batch.brief, result.tasks, [
                            ...(options.authorizedSources ?? []),
                            ...previous,
                        ]);

                        const next = mergeLearningContentBatchResults(
                            brief,
                            completed,
                            result.tasks,
                        );

                        validateLearningContent(
                            next.prefixBrief,
                            next.results,
                            options.authorizedSources,
                        );

                        completed = next.results;
                        accepted = true;
                    } catch {
                        if (repaired) {
                            return {
                                status: 'failed',
                                reason: 'invalid-output',
                            };
                        }

                        repaired = true;
                        repairing = true;
                    }
                }
            }

            const proposal = validateLearningContent(
                brief,
                completed,
                options.authorizedSources,
            );

            return {
                status: 'ready',
                proposal,
                summary: `${brief.tasks.length} requested content component(s), ${proposal.blocks.length} interactive block(s).`,
            };
        },
    };
}

export type LearningContentAuthoring = ReturnType<
    typeof createLearningContentAuthoring
>;
