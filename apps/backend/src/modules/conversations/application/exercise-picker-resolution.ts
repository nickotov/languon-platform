import {
    getExerciseActivity,
    type ExerciseGenerationRequest,
} from '@languon/contracts';
import type { TutorRequestResolution } from './tutor-request-contract';
import type { LearningContentTask } from './learning-content-contract';

function automaticActivityAllocations(
    task: LearningContentTask | undefined,
    count: number,
) {
    const activities = task?.activities;
    if (!activities) {
        return { valid: true, activities: undefined };
    }

    const distinct =
        new Set(activities.map((activity) => activity.activityId)).size ===
        activities.length;
    const missingCounts =
        activities.length > 1 &&
        activities.some((activity) => activity.count === undefined);

    if (!activities.length || !distinct || missingCounts) {
        return { valid: false, activities: undefined };
    }

    const allocations = activities.map((activity) => ({
        ...activity,
        count: activity.count ?? count,
    }));
    const allocated = allocations.reduce(
        (sum, activity) => sum + activity.count,
        0,
    );

    return { valid: allocated === count, activities: allocations };
}

/** Structured learner choices pin execution, while the planner still detects conflicting prose. */
export function applyExercisePickerChoices(
    request: ExerciseGenerationRequest,
    planned: TutorRequestResolution,
    hasSelection: boolean,
    blockReferences: readonly string[] = [],
): TutorRequestResolution {
    const task =
        planned.kind === 'generate'
            ? planned.brief.tasks[0]
            : planned.kind === 'clarify'
              ? planned.brief.tasks.find((item) => item.kind === 'exercises')
              : undefined;
    const automatic =
        request.mode === 'automatic'
            ? automaticActivityAllocations(task, request.count)
            : { valid: true, activities: undefined };
    const activities =
        request.mode === 'selected' ? request.activities : automatic.activities;
    const blockId =
        task?.source?.kind === 'editor' ? task.source.blockId : undefined;
    const pinnedBlockId =
        blockReferences.length === 1
            ? blockReferences[0]
            : blockReferences.length
              ? undefined
              : blockId;
    const source: NonNullable<LearningContentTask['source']> = hasSelection
        ? { kind: 'selection' }
        : {
              kind: 'editor',
              ...(pinnedBlockId ? { blockId: pinnedBlockId } : {}),
          };
    const expected = {
        id: 'requested-exercises',
        kind: 'exercises' as const,
        instruction:
            task?.instruction ??
            (planned.kind === 'clarify'
                ? planned.brief.tasks.find((item) => item.kind === 'exercises')
                      ?.instruction
                : undefined) ??
            'Prepare exercises using the selected activity, exact source, count and languages.',
        count: request.count,
        language: request.language,
        explanationLanguage: request.explanationLanguage,
        difficulty: request.difficulty,
        ...(activities ? { activities } : {}),
        source,
    };
    const conflict =
        !automatic.valid ||
        planned.kind !== 'generate' ||
        planned.brief.tasks.length !== 1 ||
        task?.kind !== 'exercises' ||
        (task.count !== undefined && task.count !== request.count) ||
        (task.language !== undefined && task.language !== request.language) ||
        (task.explanationLanguage !== undefined &&
            task.explanationLanguage !== request.explanationLanguage) ||
        (task.difficulty !== undefined &&
            task.difficulty !== request.difficulty) ||
        (task.source !== undefined &&
            task.source.kind !== expected.source.kind) ||
        (blockId !== undefined &&
            blockReferences.length > 0 &&
            (blockReferences.length !== 1 ||
                !blockReferences.includes(blockId))) ||
        (request.activities !== undefined &&
            task.activities !== undefined &&
            JSON.stringify(task.activities) !==
                JSON.stringify(request.activities)) ||
        (task.formats !== undefined &&
            activities?.some(
                (activity) =>
                    !task.formats!.includes(
                        getExerciseActivity(activity.activityId).format,
                    ),
            ));

    if (!conflict) {
        return {
            kind: 'generate',
            replyLanguage: request.explanationLanguage,
            continuesPending: false,
            brief: { tasks: [expected] },
        };
    }

    const questions = {
        en: 'Your message and exercise choices need clarification. Which activities, count and source should I use?',
        ru: 'Нужно уточнить сообщение и параметры упражнений. Какие задания, количество и источник использовать?',
        fr: 'Votre message et les options des exercices nécessitent une précision. Quelles activités, quel nombre et quelle source utiliser ?',
        es: 'Es necesario aclarar el mensaje y las opciones. ¿Qué actividades, cantidad y fuente debo usar?',
    };
    const locale = request.explanationLanguage.split(
        '-',
    )[0] as keyof typeof questions;

    return {
        kind: 'clarify',
        replyLanguage: request.explanationLanguage,
        continuesPending: false,
        question:
            planned.kind === 'clarify'
                ? planned.question
                : (questions[locale] ?? questions.en),
        brief: { tasks: [expected] },
    };
}
