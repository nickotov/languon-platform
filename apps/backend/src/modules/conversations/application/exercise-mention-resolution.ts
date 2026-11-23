import type {
    ConversationPromptMention,
    ExerciseGenerationRequest,
} from '@languon/contracts';
import type { TutorRequestResolution } from './tutor-request-contract';

/** A catalog mention pins identity only, and never turns an explanation into generation. */
export function applyExerciseMentionChoices(
    mentions: readonly ConversationPromptMention[],
    planned: TutorRequestResolution,
    hasSource: boolean,
    explicitRequest?: ExerciseGenerationRequest,
    newRecordingAuthorized = false,
): TutorRequestResolution {
    const ids = [
        ...new Set(
            mentions.flatMap((mention) =>
                mention.kind === 'exercise' ? [mention.activityId] : [],
            ),
        ),
    ];

    if (!ids.length || planned.kind === 'answer') {
        return planned;
    }

    if (planned.kind !== 'generate' && planned.kind !== 'clarify') {
        return planned;
    }

    const audio =
        newRecordingAuthorized &&
        planned.brief.tasks.length === 2 &&
        ids.every((id) => id.startsWith('L'))
            ? planned.brief.tasks.find((item) => item.kind === 'audio')
            : undefined;
    const task = audio
        ? planned.brief.tasks.find(
              (item) =>
                  item.kind === 'exercises' &&
                  item.source?.kind === 'task' &&
                  item.source.taskId === audio.id,
          )
        : planned.brief.tasks[0];
    const total = task?.count ?? ids.length;
    const selected =
        task?.activities?.map((activity) => activity.activityId) ?? [];
    const selectedIds = new Set(selected);
    const matchingActivitySet =
        selected.length === ids.length &&
        selectedIds.size === ids.length &&
        ids.every((id) => selectedIds.has(id));
    const conflictingActivitySet =
        task?.activities !== undefined && !matchingActivitySet;
    const explicitActivities = explicitRequest?.activities ?? [];
    const allocationTotal = Math.max(ids.length, Math.min(total, 25));
    const completeAllocations =
        matchingActivitySet &&
        task?.activities !== undefined &&
        task.activities.every((activity) => activity.count !== undefined) &&
        task.activities.reduce(
            (sum, activity) => sum + (activity.count ?? 0),
            0,
        ) === allocationTotal;
    const countsById = new Map(
        task?.activities?.map((activity) => [
            activity.activityId,
            activity.count,
        ]),
    );
    const activities = ids.map((activityId, index) => {
        const preparedCount = completeAllocations
            ? countsById.get(activityId)
            : undefined;

        return {
            activityId,
            count:
                preparedCount ??
                Math.floor(allocationTotal / ids.length) +
                    (index < allocationTotal % ids.length ? 1 : 0),
        };
    });

    // Pending briefs retain the selected identities even while source/count needs clarification.
    const pinnedBrief = {
        tasks: [
            ...(audio ? [audio] : []),
            {
                ...(task?.kind === 'exercises'
                    ? task
                    : {
                          id: 'requested-exercises',
                          kind: 'exercises' as const,
                          instruction:
                              'Generate the selected exercise types from the confirmed source.',
                      }),
                count: allocationTotal,
                activities,
            },
        ],
    };
    const conflict =
        (!hasSource && !audio) ||
        (!audio && planned.brief.tasks.length !== 1) ||
        task?.kind !== 'exercises' ||
        total < ids.length ||
        total > 25 ||
        conflictingActivitySet ||
        (explicitRequest !== undefined &&
            explicitRequest.mode !== 'selected') ||
        (explicitRequest?.mode === 'selected' &&
            (explicitActivities.length !== ids.length ||
                ids.some(
                    (id) =>
                        !explicitActivities.some(
                            (activity) => activity.activityId === id,
                        ),
                )));

    if (conflict) {
        const questions = {
            en: 'Please confirm the selected exercise types, quantity and source blocks or passage.',
            ru: 'Уточните выбранные типы упражнений, количество и исходные блоки или отрывок.',
            fr: 'Précisez les types d’exercices sélectionnés, leur nombre et les blocs ou le passage source.',
            es: 'Confirma los tipos de ejercicios, la cantidad y los bloques o el pasaje de origen.',
        };
        const language = (planned.replyLanguage ?? 'en').split(
            '-',
        )[0] as keyof typeof questions;

        return {
            kind: 'clarify',
            replyLanguage: planned.replyLanguage,
            continuesPending: false,
            question:
                planned.kind === 'clarify'
                    ? planned.question
                    : (questions[language] ?? questions.en),
            brief: pinnedBrief,
        };
    }

    if (explicitRequest) {
        return planned;
    }

    return {
        ...planned,
        brief: pinnedBrief,
    };
}
