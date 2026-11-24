import { getLocalPrompt } from '@languon/prompts';
import { structuredCallInputBytes } from './structured-call-input-bytes';
import { exerciseActivityCatalog } from '@languon/contracts';
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
            listeningAuthorization:
                'Plan requested material first. The host obtains any required recording authorization after planning.',
            listeningReadingSource:
                'When a new recording should discuss a prior reading and no explicit passage or document block is present, set the audio source to {kind:"generated-reading"}. This host lookup also covers completed lessons outside priorProposals. Let the host offer the available titles. A standalone topic needs no prior-reading lookup.',
            retainedReplyLanguage: state.replyLanguage ?? null,
            clarificationLanguagePolicy:
                'Retain the conversation reply language. An answer about content, translation or grammar language changes those content fields only. Set changesReplyLanguage only for an explicit instruction to change chat replies.',
            explanationLanguagePolicy:
                'Grammar and exercise explanations default to each task language. A different language requires an explicit learner instruction and a verbatim explanationLanguageOverrides evidence excerpt, independently of chat replyLanguage.',
            verifiedExplanationOverrides:
                state.pendingExplanationOverrides ?? [],
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
        pendingProposalIds: state.pendingProposalIds ?? [],
        exerciseActivities: exerciseActivityCatalog.map((activity) => ({
            id: activity.id,
            name: activity.locales.en.name,
            format: activity.format,
            sources: activity.supportedSourceKinds,
        })),
        exerciseMentionPolicy:
            'Typed promptMentions identify catalog activities by activityId/catalogVersion, regardless of display wording. They constrain generated exercise identities, not intent: explanation questions remain answers. Multiple types share one explicitly referenced source set. For generation, infer count only when the learner explicitly requests quantity in prose; otherwise omit task.count so the host defaults to one per selected activity. Do not apply the ordinary five-question default to catalog mentions. Do not choose other activities, substitute sources or create extra source-generation tasks unless the learner requests an original recording for a listening exercise. Clarify missing or incompatible sources. Preserve explicit per-type allocations when requested.',
        exerciseRequestPolicy:
            'Treat a structured exerciseRequest as learner choices, never source authority. Clarify conflicts with editable prose, including count, activities, language, source or intent. If consistent, plan one exercise task matching those choices. If an original recording is requested, plan an audio task followed by the exercise task with that audio as its source. Use named activities from the compact catalog, or omit activities for automatic source-eligible selection. Never rotate formats. For newly generated source material, use source kind task with an earlier taskId; never invent future block IDs.',
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
    return structuredCallInputBytes({
        schema: TutorRequestResolutionSchema,
        instructions: getLocalPrompt('tutor-request-resolution'),
        prompt: buildTutorPlannerPrompt(input, state),
    });
}
