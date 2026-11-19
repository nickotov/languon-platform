import type { StructuredFinishReason } from './structured-output-diagnostics';
import { generationRevisionCall } from '../../application/generation-revision-call';
import { ConversationError } from '../../domain/conversation';
import { GenerationExecutionFailure } from '../../application/generation-failure';
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
    structuredResponseReader,
    generateTutorObject,
    type createTutorRequestAgents,
} from './tutor-request-agents';
import { publishLearningProposal } from './learning-content-operations';

export interface StructuredCallValidation {
    completedStructuredResponse?(
        id: string,
    ): StructuredFinishReason | undefined;
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
    planOrigin: 'saved' | 'created-in-stage' = 'saved',
) {
    const restored = restoreGenerationExecution(context);
    const authoring = createLearningContentAuthoring({
        ...restored,
        run: { runId: context.runId, revision: context.revision },
        ...(context.unitAttempts ? { unitAttempts: context.unitAttempts } : {}),
        ...(input.onGenerationAttempt
            ? { onGenerationAttempt: input.onGenerationAttempt }
            : {}),
        planCreatedInStage: planOrigin === 'created-in-stage',
        ...(readBudget ? { readBudget } : {}),
        authorizedSources: context.sources
            .filter((source) => !source.proposalId)
            .flatMap((source) => source.blocks),
        generate: async (call) => {
            const work = () =>
                generateTutorObject({
                    agent: agents.learningContentAuthor,
                    ...call,
                    operationId: `${input.operationId}:${call.validationId}`,
                    completedResponse: structuredResponseReader(
                        validation,
                        call.validationId,
                    ),
                });

            // The model gate owns dispatch evidence. Let the caller classify its
            // provider failure after routing; SDK errors alone do not prove dispatch.
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

            try {
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
            } catch (error) {
                signal.throwIfAborted();

                throw error instanceof ConversationError
                    ? error
                    : new GenerationExecutionFailure({
                          code: 'publication',
                          phase: 'checkpoint',
                          ...(results.length === 1
                              ? { taskId: results[0]!.taskId }
                              : {}),
                      });
            }
        },
    });
    const result = await authoring.generate(restored.brief, signal);
    let text: string;
    if (result.status === 'paused') {
        await input.onGenerationPause?.('budget');
        text = context.plan.replyLanguage.startsWith('ru')
            ? 'План урока и текущий прогресс сохранены.'
            : 'The lesson plan and current progress are saved.';
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
        ).catch((error: unknown) => {
            signal.throwIfAborted();

            throw error instanceof ConversationError
                ? error
                : new GenerationExecutionFailure({ code: 'publication' });
        });
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
        if (
            result.status === 'unsupported' &&
            result.code === 'output-capacity'
        ) {
            throw new GenerationExecutionFailure({
                code: 'admission-blocked',
                admissionReason: 'allowance-required',
            });
        }

        throw new GenerationExecutionFailure(
            result.status === 'failed' && result.diagnostic
                ? result.diagnostic
                : {
                      code:
                          result.status === 'failed' &&
                          result.reason === 'output-limit'
                              ? 'output-limit'
                              : 'content-invalid',
                  },
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
            ...generationRevisionCall(context.plan, input.message.content),
            signal,
            operationId: `${input.operationId}:revision-plan`,
            completedResponse: structuredResponseReader(
                validation,
                validationId,
            ),
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
