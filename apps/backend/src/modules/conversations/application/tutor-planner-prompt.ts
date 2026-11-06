import { getLocalPrompt } from '@languon/prompts';
import { z } from 'zod';
import type { PreparedTutorHistory, TutorRunInput } from './ports/tutor-runner';
import { learningContentCapabilities } from './learning-content-contract';
import {
    deserializeLearningContentBrief,
    serializeLearningContentBrief,
} from './learning-content-transport';
import type { LearningContentBrief } from './learning-content-contract';
import { tutorMessageModelContent } from './tutor-message-context';
import {
    TutorRequestResolutionSchema,
    TutorRequestStateSchema,
    tutorRequestStateKey,
    type TutorRequestState,
} from './tutor-request-contract';
import { frozenTutorTextSources } from './tutor-request-sources';

type PlannerInput = Pick<
    TutorRunInput,
    'message' | 'sourceContext' | 'preferences' | 'portraitContext'
>;

/** Source text stays in the server registry even when the current editor changes. */
export function projectTutorPendingBrief(brief: LearningContentBrief) {
    const transport = JSON.parse(serializeLearningContentBrief(brief)) as {
        tasks: unknown[];
        sources: { id: string; text: string }[];
    };

    return {
        tasks: transport.tasks,
        sources: transport.sources.map(({ id, text }) => ({
            id,
            location: 'server-pending-registry',
            characters: text.length,
            utf8Bytes: Buffer.byteLength(text, 'utf8'),
        })),
    };
}

/** Corrupt private state cannot introduce planner instructions or source authority. */
export function readTutorPlannerState(stored: unknown): TutorRequestState {
    try {
        const value = stored as Record<string, unknown> | null;

        return TutorRequestStateSchema.parse({
            ...value,
            pending: value?.pending
                ? deserializeLearningContentBrief(value.pending)
                : null,
        });
    } catch {
        return { pending: null, proposals: [] };
    }
}

export function tutorPlannerStateFromMemory(
    memory: unknown,
): TutorRequestState {
    if (!Array.isArray(memory)) {
        return { pending: null, proposals: [] };
    }

    const rows: unknown[] = memory;
    const row = rows.find(
        (entry: unknown) =>
            !!entry &&
            typeof entry === 'object' &&
            'key' in entry &&
            entry.key === tutorRequestStateKey,
    );

    return readTutorPlannerState(
        row && typeof row === 'object' && 'value' in row ? row.value : null,
    );
}

/** One serialization path for admission and the actual planner dispatch. */
export function buildTutorPlannerPrompt(
    input: PlannerInput,
    state: TutorRequestState = { pending: null, proposals: [] },
    history: PreparedTutorHistory = { messages: [] },
): string {
    const sources = frozenTutorTextSources(input);

    return JSON.stringify({
        hostExecutionPolicy: {
            capacityAuthority: 'host',
            vocabularyBatching: 'automatic',
            vocabularyPublication: 'one-complete-block',
            priorAssistantCapacityClaimsAuthoritative: false,
            pendingSources:
                'Descriptors only; the host restores the exact retained source after planning.',
        },
        currentMessage: tutorMessageModelContent(input.message),
        source: input.sourceContext,
        preferences: input.preferences,
        approvedPortrait: input.portraitContext,
        editorTarget: input.message.editorTarget,
        availableTextSources: {
            editor: sources.editor?.length ?? 0,
            selection: sources.selection?.length ?? 0,
        },
        pendingBrief: state.pending
            ? projectTutorPendingBrief(state.pending)
            : null,
        priorProposals: state.proposals,
        observations: history.observations,
        recentMessages: history.messages.map((message) => ({
            role: message.role,
            content: message.content.slice(0, 2_000),
        })),
        capabilities: learningContentCapabilities,
    });
}

/**
 * Pinned structured-output wire projection, checked against the real SDK model
 * boundary in tests. Count the JSON prompt as a string inside the native prompt:
 * quotes, backslashes and controls must survive both serialization layers.
 */
export function tutorPlannerInputBytes(
    input: PlannerInput,
    state: TutorRequestState = { pending: null, proposals: [] },
): number {
    const schema = z.toJSONSchema(TutorRequestResolutionSchema, {
        io: 'input',
        target: 'draft-7',
    });
    const jsonInstruction = `Return your response as JSON matching this schema:\n\n${JSON.stringify(schema)}\n\nReturn only valid JSON. Do not include markdown or explanatory text.`;

    return Buffer.byteLength(
        JSON.stringify({
            prompt: [
                {
                    role: 'system',
                    content: getLocalPrompt('tutor-request-resolution'),
                },
                {
                    role: 'user',
                    content: [
                        {
                            type: 'text',
                            text: buildTutorPlannerPrompt(input, state),
                            // The SDK stamps this metadata during message conversion.
                            // Maximum safe integer bounds every valid JS timestamp.
                            providerOptions: {
                                mastra: { createdAt: Number.MAX_SAFE_INTEGER },
                            },
                        },
                        { type: 'text', text: jsonInstruction },
                    ],
                },
            ],
        }),
        'utf8',
    );
}
