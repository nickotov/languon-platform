import {
    exerciseActivityCatalog,
    type ExerciseActivityId,
    type ExerciseActivitySourceKind,
    type SubmitConversationTurnRequest,
} from '@languon/contracts';
import type { KnowledgeBlockReference } from './knowledge-block-references';

export type ExerciseGenerationRequest = NonNullable<
    SubmitConversationTurnRequest['exerciseRequest']
>;

export function exerciseSourceKind(
    type: KnowledgeBlockReference['type'],
): ExerciseActivitySourceKind | undefined {
    if (type === 'vocabulary' || type === 'grammar') {
        return type;
    }

    return type === 'bilingual-text' ? 'text' : undefined;
}

export function eligibleExerciseActivities(
    kinds: ExerciseActivitySourceKind[],
) {
    return exerciseActivityCatalog.filter((activity) =>
        activity.supportedSourceKinds.some((kind) => kinds.includes(kind)),
    );
}

/** Each selected activity receives a question before the remaining count is distributed in order. */
export function exerciseAllocations(ids: ExerciseActivityId[], count: number) {
    if (
        !ids.length ||
        !Number.isInteger(count) ||
        count < ids.length ||
        count < 1 ||
        count > 25
    ) {
        return null;
    }

    if (new Set(ids).size !== ids.length) {
        return null;
    }

    const base = Math.floor(count / ids.length);
    const remainder = count % ids.length;

    return ids.map((activityId, index) => ({
        activityId,
        count: base + (index < remainder ? 1 : 0),
    }));
}

export function validExerciseLanguage(value: string) {
    return (
        value.length <= 35 &&
        /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/u.test(value)
    );
}

export function exerciseGenerationError({
    hasSource,
    mode,
    selected,
    eligible,
    count,
    allocations,
    language,
    explanationLanguage,
}: {
    hasSource: boolean;
    mode: 'automatic' | 'selected';
    selected: ExerciseActivityId[];
    eligible: ExerciseActivityId[];
    count: number;
    allocations: ExerciseGenerationRequest['activities'] | null;
    language: string;
    explanationLanguage: string;
}):
    | 'missing'
    | 'ineligible'
    | 'noActivities'
    | 'tooMany'
    | 'missingLanguage'
    | undefined {
    if (!hasSource) {
        return 'missing';
    }

    if (mode === 'selected' && selected.some((id) => !eligible.includes(id))) {
        return 'ineligible';
    }

    if (mode === 'selected' && !selected.length) {
        return 'noActivities';
    }

    if (
        !Number.isInteger(count) ||
        count < 1 ||
        count > 25 ||
        (mode === 'selected' &&
            (!allocations ||
                selected.length > count ||
                allocations.some(
                    (item) =>
                        !Number.isInteger(item.count) ||
                        item.count < 1 ||
                        item.count > 25,
                ) ||
                allocations.reduce((sum, item) => sum + item.count, 0) !==
                    count))
    ) {
        return 'tooMany';
    }

    return validExerciseLanguage(language) &&
        validExerciseLanguage(explanationLanguage)
        ? undefined
        : 'missingLanguage';
}
