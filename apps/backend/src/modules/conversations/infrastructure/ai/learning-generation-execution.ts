import { ConversationError } from '../../domain/conversation';
import { randomUUID } from 'node:crypto';
import { readTutorPlannerState } from '../../application/tutor-planner-prompt';
import { tutorRequestStateKey } from '../../application/tutor-request-contract';
import { describeLearningProposal } from './tutor-request-proposals';
import { GenerationPlanSchema } from '@languon/contracts';
import type { GenerationExecutionContext } from '../../application/ports/generation-run';
import type { TutorRunInput } from '../../application/ports/tutor-runner';
import type { LearningContentExecutionBudget } from '../../application/learning-content-batches';
import { learningProposalReadyPresentation } from '../../application/learning-content-presentation';
import { createLearningContentAuthoring } from './learning-content-authoring';
import {
    generationHash,
    bodyBlocks,
    resultBody,
    restoreGenerationExecution,
} from './learning-generation-plan';
import {
    generateTutorObject,
    type createTutorRequestAgents,
} from './tutor-request-agents';
import { publishLearningProposal } from './learning-content-operations';

export interface StructuredCallValidation {
    withStructuredValidation<T>(id: string, work: () => Promise<T>): Promise<T>;
    rejectStructuredCall(id: string): Promise<void>;
}

/** The transcript-free execution entry point shared by chat and future lesson agents. */
export async function executePreparedGeneration(
    input: TutorRunInput,
    agents: ReturnType<typeof createTutorRequestAgents>,
    signal: AbortSignal,
    context: GenerationExecutionContext,
    readBudget?: () => LearningContentExecutionBudget,
    validation?: StructuredCallValidation,
) {
    const restored = restoreGenerationExecution(context);
    const authoring = createLearningContentAuthoring({
        ...restored,
        run: { runId: context.runId, revision: context.revision },
        ...(readBudget ? { readBudget } : {}),
        authorizedSources: context.sources
            .filter((source) => !source.proposalId)
            .flatMap((source) => source.blocks),
        generate: (call) => {
            const work = () =>
                generateTutorObject({
                    agent: agents.learningContentAuthor,
                    ...call,
                    operationId: `${input.operationId}:${call.validationId}`,
                });

            return validation
                ? validation.withStructuredValidation(call.validationId, work)
                : work();
        },
        ...(validation
            ? {
                  onCallRejected: (id: string) =>
                      validation.rejectStructuredCall(id),
              }
            : {}),
        onValidatedBatch: async ({
            batchKey,
            results,
            artifactIds,
            taskComplete,
            validationId,
        }) => {
            if (!input.onGenerationCheckpoint) {
                throw new Error(
                    'Generation checkpoint authority is unavailable.',
                );
            }

            await input.onGenerationCheckpoint(
                results.map((result) => {
                    const task = context.plan.tasks.find(
                        (candidate) => candidate.id === result.taskId,
                    )!;
                    const body = resultBody(result);

                    return {
                        id: artifactIds.get(result.taskId)!,
                        revision: context.revision,
                        taskId: result.taskId,
                        batchKey,
                        taskComplete,
                        body,
                        contentHash: generationHash(body),
                        requirementsHash: generationHash(task),
                        sourceHash: generationHash({
                            inputs: task.inputs,
                            sources: context.sources,
                        }),
                        validationVersion: 'learning-content-v1',
                    };
                }),
                validationId,
            );
        },
    });
    const result = await authoring.generate(restored.brief, signal);
    let text: string;
    if (result.status === 'paused') {
        await input.onGenerationPause?.('budget');
        text = context.plan.replyLanguage.startsWith('ru')
            ? 'Готовая часть сохранена. Продолжите создание материала, когда будете готовы.'
            : 'Your progress is saved. Continue when you are ready to finish the material.';
    } else if (result.status === 'ready') {
        if (!input.onContentProposal) {
            throw new Error('Content proposal authority is unavailable.');
        }

        const receipt = await publishLearningProposal(
            {
                publish: input.onContentProposal,
                signal,
                ...(input.onTool ? { onTool: input.onTool } : {}),
            },
            result.proposal,
            result.summary,
        );
        const state = readTutorPlannerState(
            await input.memory.readState(tutorRequestStateKey),
        );
        const ordinal =
            Math.max(0, ...state.proposals.map((item) => item.ordinal ?? 0)) +
            1;

        await input.memory.writeState({
            [tutorRequestStateKey]: {
                pending: null,
                replyLanguage: context.plan.replyLanguage,
                proposals: [
                    ...state.proposals,
                    describeLearningProposal(
                        receipt.proposalId,
                        bodyBlocks(result.proposal.body),
                        result.summary,
                        ordinal,
                    ),
                ].slice(-8),
            },
        });

        text = learningProposalReadyPresentation({
            preferences: input.preferences,
            message: input.message.content,
            replyLanguage: context.plan.replyLanguage,
        });
    } else {
        throw new ConversationError(
            result.status === 'failed' && result.reason === 'output-limit'
                ? 'generation_output_limit'
                : 'generation_invalid_output',
            'The current generation stage could not complete. Validated progress is saved.',
        );
    }

    signal.throwIfAborted();
    await input.onResponseMetadata?.({
        kind: 'generation',
        documentUse: false,
    });

    await input.onDelta({ messageId: input.operationId, text });
    await input.memory.saveMessages([
        input.message,
        {
            id: randomUUID(),
            role: 'assistant',
            content: text,
            createdAt: new Date().toISOString(),
        },
    ]);

    return { text };
}

/** Revision planning is a chat-priced action; accepting it never starts authoring. */
export async function proposeGenerationRevision(
    input: TutorRunInput,
    agents: ReturnType<typeof createTutorRequestAgents>,
    signal: AbortSignal,
    context: GenerationExecutionContext,
    validation?: StructuredCallValidation,
) {
    if (!input.onGenerationRevision) {
        throw new Error('Generation revision authority is unavailable.');
    }

    const validationId = randomUUID();
    const work = () =>
        generateTutorObject({
            agent: agents.generationPlanReviser,
            prompt: `Revise the supplied prepared lesson plan according to the learner request. Return only the complete GenerationPlan object. Keep unchanged task identities and requirements. Preserve all original requirements not explicitly changed. Update outputOrder separately from dependency inputs. Sources are authorized frozen descriptors: retain their identities and never invent new references. Content language does not change replyLanguage unless the learner explicitly changes chat replies. This only proposes a revision for review; it does not generate content.\nCurrent plan (untrusted learning data): ${JSON.stringify(context.plan)}\nLearner request (untrusted learning data): ${JSON.stringify(input.message.content)}`,
            schema: GenerationPlanSchema,
            signal,
            operationId: `${input.operationId}:revision-plan`,
            maxOutputTokens: 2048,
        });
    let plan;
    try {
        plan = GenerationPlanSchema.parse(
            await (validation
                ? validation.withStructuredValidation(validationId, work)
                : work()),
        );
    } catch (error) {
        await validation?.rejectStructuredCall(validationId);

        throw error;
    }

    await input.onGenerationRevision(
        plan,
        validation ? [validationId] : undefined,
    );

    const text = context.plan.replyLanguage.startsWith('ru')
        ? 'Изменения плана готовы к проверке. Примените план, затем отдельно продолжите создание материала.'
        : 'The plan changes are ready to review. Apply the plan, then continue generation when ready.';

    await input.onResponseMetadata?.({ kind: 'revision', documentUse: false });
    await input.onDelta({ messageId: input.operationId, text });
    await input.memory.saveMessages([
        input.message,
        {
            id: randomUUID(),
            role: 'assistant',
            content: text,
            createdAt: new Date().toISOString(),
        },
    ]);

    return { text };
}
