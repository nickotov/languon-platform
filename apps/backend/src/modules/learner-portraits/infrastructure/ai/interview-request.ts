import { getLocalPrompt } from '@languon/prompts';
import type { TextAiAdmissionExecution } from '../../../text-ai/application/text-ai-admission-participant';
import type { InterviewOperation } from '../../application/ports/interview-store';

const coreTopics = [
    'languages',
    'explanation-languages',
    'goals',
    'style',
    'accommodations',
] as const;

/** Shared by admission and execution so the reserved request cannot drift. */
export function buildInterviewRequest(
    operation: Pick<InterviewOperation, 'input' | 'context'>,
) {
    const completed = new Set(operation.context.completedTopics);
    if (operation.input.kind !== 'chat') completed.add(operation.input.topic);
    return JSON.stringify({
        nextCoreTopic:
            coreTopics.find((topic) => !completed.has(topic)) ?? 'update',
        context: operation.context,
        submission: operation.input,
        instruction:
            'Return JSON only. Proposals remain pending review; never claim they are saved or active.',
    });
}

/**
 * One UTF-8 byte per token is deliberately conservative. Include JSON escaping
 * and 1,024 bytes for Mastra message framing. The worker's actual model gate
 * independently checks this immutable bound before accounting or dispatch.
 */
export function interviewInputTokenLimit(
    operation: Pick<InterviewOperation, 'input' | 'context'>,
    modelLimit: number,
) {
    const envelope = {
        prompt: [
            { role: 'system', content: getLocalPrompt('learner-interviewer') },
            {
                role: 'user',
                content: [
                    { type: 'text', text: buildInterviewRequest(operation) },
                ],
            },
        ],
        tools: [],
    };
    return Math.min(
        modelLimit,
        Buffer.byteLength(JSON.stringify(envelope), 'utf8') + 1024,
    );
}

export type InterviewExecution = TextAiAdmissionExecution & {
    interviewCreditsBypass: boolean;
    interviewInputTokenLimit?: number;
};

export function readInterviewInputTokenLimit(
    execution: InterviewExecution,
): number {
    const modelLimit = execution.snapshot?.perCallMaxInputTokens;
    const limit =
        execution.interviewInputTokenLimit === undefined
            ? modelLimit
            : execution.interviewInputTokenLimit;
    if (
        !Number.isSafeInteger(limit) ||
        !modelLimit ||
        !limit ||
        limit < 1 ||
        limit > modelLimit
    )
        throw new Error('Pinned interview input limit is invalid.');
    return limit;
}
