import type { LearningContentBrief } from './learning-content-contract';
import type { TutorRequestState } from './tutor-request-contract';

type VerifiedOverride = NonNullable<
    TutorRequestState['pendingExplanationOverrides']
>[number];

/** Content explanations default to content language, never the chat language. */
export function resolveTaskExplanationLanguages(
    brief: LearningContentBrief,
    input: {
        retained?: readonly VerifiedOverride[];
        overrides?: readonly {
            taskId: string;
            language: string;
            evidence: string;
        }[];
        learnerMessages: readonly string[];
        exerciseChoice?: string;
    },
): { brief: LearningContentBrief; overrides: VerifiedOverride[] } {
    const verified = new Map(
        (input.retained ?? []).map((item) => [item.taskId, item]),
    );
    const explicit = new Map(
        (input.overrides ?? [])
            .filter((item) =>
                input.learnerMessages.some((message) =>
                    message.includes(item.evidence),
                ),
            )
            .map((item) => [item.taskId, item]),
    );
    const overrides: VerifiedOverride[] = [];
    const tasks = brief.tasks.map((task) => {
        if (task.kind !== 'grammar' && task.kind !== 'exercises') {
            return task;
        }

        const previous = verified.get(task.id);
        const requested = explicit.get(task.id);
        const language =
            task.kind === 'exercises' && input.exerciseChoice
                ? input.exerciseChoice
                : (requested?.language ??
                  (previous &&
                  (previous.studiedLanguage === task.language ||
                      previous.studiedLanguage === '*')
                      ? previous.language
                      : task.language));

        if (language && language !== task.language) {
            overrides.push({
                taskId: task.id,
                language,
                studiedLanguage: task.language ?? '*',
            });
        }

        const { explanationLanguage: _unverifiedLanguage, ...requirements } =
            task;

        return {
            ...requirements,
            ...(language ? { explanationLanguage: language } : {}),
        };
    });

    return { brief: { ...brief, tasks }, overrides };
}
