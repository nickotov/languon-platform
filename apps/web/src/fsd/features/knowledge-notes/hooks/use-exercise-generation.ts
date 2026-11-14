import { useState, type ChangeEvent, type FormEvent } from 'react';
import {
    exerciseActivityCatalog,
    type ExerciseActivityId,
} from '@languon/contracts';
import type { KnowledgeBlockReference } from '../lib/knowledge-block-references';
import {
    eligibleExerciseActivities,
    exerciseAllocations,
    exerciseSourceKind,
    exerciseGenerationError,
    type ExerciseGenerationRequest,
} from '../lib/exercise-generation';
import { exerciseGenerationCopy } from '../lib/exercise-generation-copy';

export type PreparedExerciseRequest = {
    request: ExerciseGenerationRequest;
    blockIds: string[];
    prompt: string;
};

export function useExerciseGeneration({
    sources,
    selectedIds,
    passage,
    language: initialLanguage = '',
    explanationLanguage = 'en',
    locale,
    onPrepare,
    initialRequest,
}: {
    sources: KnowledgeBlockReference[];
    selectedIds: string[];
    passage?: string | undefined;
    language?: string | undefined;
    explanationLanguage?: string | undefined;
    locale: string;
    onPrepare(value: PreparedExerciseRequest): void;
    initialRequest?: ExerciseGenerationRequest | undefined;
}) {
    const text = exerciseGenerationCopy(locale);
    const eligibleSources = sources.filter((source) =>
        exerciseSourceKind(source.type),
    );
    const initialSources = eligibleSources.filter((source) =>
        selectedIds.includes(source.id),
    );
    const [sourceId, setSourceId] = useState(
        initialSources.length
            ? '__references__'
            : passage
              ? '__selection__'
              : '',
    );
    const [mode, setMode] = useState<'automatic' | 'selected'>(
        initialRequest?.mode ?? 'automatic',
    );
    const [selected, setSelected] = useState<ExerciseActivityId[]>(
        initialRequest?.activities?.map((activity) => activity.activityId) ??
            [],
    );
    const [count, setCount] = useState(String(initialRequest?.count ?? 5));
    const [language, setLanguage] = useState(
        initialRequest?.language ??
            initialSources[0]?.language ??
            initialLanguage,
    );
    const [explanation, setExplanation] = useState(
        initialRequest?.explanationLanguage ?? explanationLanguage,
    );
    const [difficulty, setDifficulty] = useState<
        ExerciseGenerationRequest['difficulty']
    >(initialRequest?.difficulty ?? 'intermediate');
    const [explicitAllocations, setExplicitAllocations] = useState(
        initialRequest?.activities,
    );
    const selectedSources =
        sourceId === '__references__'
            ? initialSources
            : eligibleSources.filter((source) => source.id === sourceId);
    const kinds = selectedSources.flatMap((source) => {
        const kind = exerciseSourceKind(source.type);

        return kind ? [kind] : [];
    });
    const usesSelection =
        sourceId === '__selection__' && Boolean(passage?.trim());

    if (usesSelection) {
        kinds.push('text');
    }

    const eligible = eligibleExerciseActivities(kinds);
    const activities = exerciseActivityCatalog.filter(
        (activity) =>
            eligible.includes(activity) || selected.includes(activity.id),
    );
    const allocations =
        explicitAllocations ?? exerciseAllocations(selected, Number(count));
    const errorCode = exerciseGenerationError({
        hasSource: kinds.length > 0,
        mode,
        selected,
        eligible: eligible.map((activity) => activity.id),
        count: Number(count),
        allocations,
        language,
        explanationLanguage: explanation,
    });
    const error = errorCode ? text[errorCode] : undefined;

    function changeSource(event: ChangeEvent<HTMLSelectElement>) {
        setSourceId(event.target.value);
        const source = eligibleSources.find(
            (item) => item.id === event.target.value,
        );

        if (source?.language) {
            setLanguage(source.language);
        }
    }

    function changeMode(value: string) {
        setMode(value === 'selected' ? 'selected' : 'automatic');
    }

    function toggleActivity(id: ExerciseActivityId) {
        const removed = selected.includes(id);
        setExplicitAllocations((current) => {
            if (!current) {
                return undefined;
            }

            return removed
                ? current.filter((item) => item.activityId !== id)
                : [...current, { activityId: id, count: 1 }];
        });

        setSelected((current) =>
            current.includes(id)
                ? current.filter((item) => item !== id)
                : [...current, id],
        );
    }

    function changeCount(event: ChangeEvent<HTMLInputElement>) {
        setCount(event.target.value);
    }

    function changeAllocation(activityId: ExerciseActivityId, count: string) {
        setExplicitAllocations((current) => {
            const prepared =
                current ??
                allocations ??
                selected.map((id) => ({ activityId: id, count: 1 }));

            return prepared.map((item) =>
                item.activityId === activityId
                    ? { ...item, count: Number(count) }
                    : item,
            );
        });
    }

    function distribute() {
        setExplicitAllocations(undefined);
    }

    function changeLanguage(event: ChangeEvent<HTMLInputElement>) {
        setLanguage(event.target.value);
    }

    function changeExplanation(event: ChangeEvent<HTMLInputElement>) {
        setExplanation(event.target.value);
    }

    function changeDifficulty(event: ChangeEvent<HTMLSelectElement>) {
        setDifficulty(
            event.target.value as ExerciseGenerationRequest['difficulty'],
        );
    }

    function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (error) {
            return;
        }

        const request: ExerciseGenerationRequest = {
            mode,
            count: Number(count),
            language,
            explanationLanguage: explanation,
            difficulty,
            ...(mode === 'selected' && allocations
                ? { activities: allocations }
                : {}),
        };

        onPrepare({
            request,
            blockIds: selectedSources.map((source) => source.id),
            prompt: text.prompt.replace('{count}', count),
        });
    }

    return {
        text,
        sourceId,
        initialSources,
        eligibleSources,
        selectedSources,
        usesSelection,
        mode,
        selected,
        count,
        language,
        explanation,
        difficulty,
        activities,
        allocations,
        error,
        changeSource,
        changeMode,
        toggleActivity,
        changeCount,
        changeAllocation,
        distribute,
        changeLanguage,
        changeExplanation,
        changeDifficulty,
        submit,
    };
}
