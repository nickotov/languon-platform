import { validateReusablePortraitItems } from '../../domain/portrait-policy';
import { Agent } from '@mastra/core/agent';
import { noopLogger } from '@mastra/core/logger';
import { MastraError } from '@mastra/core/error';
import {
    resolveModelConfig,
    type MastraModelConfig,
    type ModelRouterModelId,
    type OpenAICompatibleConfig,
} from '@mastra/core/llm';
import { getLocalPrompt } from '@languon/prompts';
import { PortraitInterviewerOutputSchema } from '@languon/contracts';
import { createCanonicalMastra } from '../../../../mastra/composition';
import {
    createTutorModelGate,
    type TutorProviderModel,
} from '../../../conversations/infrastructure/ai/accounted-tutor-model';
import type { TutorAccountingPort } from '../../../conversations/application/ports/tutor-runner';
import {
    PortraitInterviewInvalidModelOutputError,
    type InterviewRunner,
} from '../../application/ports/interview-store';
import { buildInterviewRequest } from './interview-request';

export function createLearnerInterviewerAgent(model: MastraModelConfig) {
    const agent = new Agent({
        id: 'learner-interviewer',
        name: 'Learner portrait interviewer',
        instructions: getLocalPrompt('learner-interviewer'),
        model,
        defaultOptions: {
            maxSteps: 1,
            modelSettings: { maxRetries: 0, maxOutputTokens: 4096 },
        },
    });
    agent.__registerPrimitives({ logger: noopLogger });
    return agent;
}
export function createLearnerInterviewerRunner(options: {
    model: ModelRouterModelId | OpenAICompatibleConfig | TutorProviderModel;
    accounting: TutorAccountingPort;
    maxInputTokens: number;
    maxOutputTokens?: number;
}): InterviewRunner {
    return {
        async run({ operation, signal }) {
            const model =
                typeof options.model === 'object' &&
                'specificationVersion' in options.model
                    ? options.model
                    : await resolveModelConfig(options.model);
            if (model.specificationVersion !== 'v2')
                throw new Error('The selected interview model is unavailable.');
            const gate = createTutorModelGate({
                accounting: options.accounting,
                signal,
                maxInputTokens: options.maxInputTokens,
            });
            const agent = createCanonicalMastra({
                learnerInterviewer: createLearnerInterviewerAgent(
                    gate.wrap(model, 'answer'),
                ),
            }).getAgent('learnerInterviewer');
            const content = buildInterviewRequest(operation);
            try {
                const output = await agent.generate(content, {
                    abortSignal: gate.signal,
                    maxSteps: 1,
                    toolChoice: 'none',
                    structuredOutput: {
                        schema: PortraitInterviewerOutputSchema,
                        jsonPromptInjection: 'inline',
                        errorStrategy: 'strict',
                    },
                    tracingOptions: { hideInput: true, hideOutput: true },
                    modelSettings: {
                        maxRetries: 0,
                        maxOutputTokens: Math.min(
                            4096,
                            options.maxOutputTokens ?? 4096,
                        ),
                    },
                });
                gate.signal.throwIfAborted();
                // No coercion, markdown stripping, repair calls, or silently truncated answers.
                try {
                    // The SDK object is authoritative, but its tolerant JSON parser can
                    // strip markdown or repair controls. Require a genuine JSON wire
                    // response too; do not silently salvage malformed paid output.
                    JSON.parse(output.text);
                    const result = PortraitInterviewerOutputSchema.parse(
                        output.object,
                    );
                    if (result.proposedItems)
                        validateReusablePortraitItems(result.proposedItems);
                    return result;
                } catch {
                    throw new PortraitInterviewInvalidModelOutputError();
                }
            } catch (error) {
                const safeError =
                    error instanceof MastraError &&
                    (error.id ===
                        'STRUCTURED_OUTPUT_SCHEMA_VALIDATION_FAILED' ||
                        error.id === 'STRUCTURED_OUTPUT_OBJECT_UNDEFINED')
                        ? new PortraitInterviewInvalidModelOutputError()
                        : error;
                gate.abort(safeError);
                throw safeError;
            }
        },
    };
}
