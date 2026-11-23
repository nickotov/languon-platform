import {
    getExerciseActivity,
    type ExerciseActivityId,
    type LearningBlock,
} from '@languon/contracts';

type NamedExerciseSourceBinding =
    | { kind: 'vocabulary'; blockId: string; entryIds: string[] }
    | { kind: 'grammar'; blockId: string }
    | { kind: 'text'; blockId: string; segmentIds: string[] };

function sourceBinding(
    activityId: ExerciseActivityId,
    sources: readonly LearningBlock[],
): NamedExerciseSourceBinding {
    const activity = getExerciseActivity(activityId);
    const source = sources.find((candidate) =>
        activity.supportedSourceKinds.includes(
            candidate.type === 'bilingual-text'
                ? 'text'
                : candidate.type === 'vocabulary' ||
                    candidate.type === 'grammar'
                  ? candidate.type
                  : 'text',
        ),
    );

    if (!source) {
        throw new Error(
            `Fixture ${activityId} needs an eligible frozen source.`,
        );
    }

    if (source.type === 'vocabulary') {
        return {
            kind: 'vocabulary',
            blockId: source.id,
            entryIds: [source.entries[0]!.id],
        };
    }

    if (source.type === 'grammar') {
        return { kind: 'grammar', blockId: source.id };
    }

    if (source.type === 'bilingual-text') {
        return {
            kind: 'text',
            blockId: source.id,
            segmentIds: [source.segments[0]!.id],
        };
    }

    throw new Error(
        `Fixture ${activityId} needs vocabulary, grammar, or text.`,
    );
}

function selectedVocabularyTerm(
    binding: NamedExerciseSourceBinding,
    sources: readonly LearningBlock[],
): string | undefined {
    if (binding.kind !== 'vocabulary') {
        return undefined;
    }

    const source = sources.find(
        (candidate) => candidate.id === binding.blockId,
    );

    if (source?.type !== 'vocabulary') {
        throw new Error(
            'Fixture vocabulary binding must resolve a vocabulary block.',
        );
    }

    return source.entries.find((entry) => entry.id === binding.entryIds[0])
        ?.term;
}

/**
 * Deterministic provider-wire exercise. It deliberately contains ID-only source
 * bindings: production host code must reconstruct canonical provenance from its
 * authorized snapshots before validating or publishing this output.
 */
export function namedExerciseFixture(input: {
    activityId: ExerciseActivityId;
    sources: readonly LearningBlock[];
}) {
    const activity = getExerciseActivity(input.activityId);
    const binding = sourceBinding(input.activityId, input.sources);
    const term = selectedVocabularyTerm(binding, input.sources);
    const answer =
        activity.id === 'V01'
            ? term!
            : activity.id === 'R03'
              ? 'True'
              : 'réponse';
    const question =
        activity.id === 'V01'
            ? 'Give the selected French word from its meaning.'
            : activity.id === 'V06'
              ? `Write the requested form of ${term}.`
              : `Use the selected source${term ? ` term ${term}` : ''} for ${activity.id}.`;
    const common = {
        activityId: activity.id,
        objective: `Practise ${activity.id} from the selected source.`,
        title: `${activity.id} fixture`,
        question,
        explanation: `Fixture explanation for ${activity.id}.`,
        sourceBindings: [binding],
    };
    const rubric = {
        'task-completion': 'Complete the requested task.',
        meaning: 'Preserve the source meaning.',
        ...(activity.category === 'reading'
            ? { evidence: 'Use source evidence.' }
            : activity.category === 'writing'
              ? {}
              : { 'target-use': 'Use the target accurately.' }),
    };

    if (activity.id === 'R03') {
        return {
            ...common,
            correctRole: 'true',
            reasons: {
                true: 'The source confirms it.',
                false: 'This contradicts the source.',
                'not-stated': 'The source addresses this claim.',
            },
        };
    }

    if (activity.format === 'multiple-choice') {
        return {
            ...common,
            correct: { text: answer, explanation: 'The source supports it.' },
            distractors: [
                {
                    text: 'incorrect answer',
                    explanation: 'Inconsistent with the source.',
                },
            ],
        };
    }

    if (activity.format === 'fill-in-the-blank') {
        return {
            ...common,
            referenceAnswer: answer,
            parts: [
                { kind: 'text', text: 'Complete the source-based sentence: ' },
                {
                    kind: 'gap',
                    acceptedAnswers: [answer],
                    explanation: 'The source supports this answer.',
                },
            ],
            ...(activity.checkingPolicy === 'hybrid' ? { rubric } : {}),
        };
    }

    return {
        ...common,
        rubric,
        ...(activity.checkingPolicy === 'hybrid'
            ? { acceptedAnswers: [answer] }
            : { referenceAnswer: answer }),
    };
}
