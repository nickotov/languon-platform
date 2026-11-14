import {
    getExerciseActivity,
    type ExerciseActivityId,
    type LearningBlock,
} from '@languon/contracts';
import { randomUUID } from 'node:crypto';

type NamedExerciseSourceBinding =
    | { kind: 'vocabulary'; blockId: string; entryIds: string[] }
    | { kind: 'grammar'; blockId: string }
    | { kind: 'text'; blockId: string; segmentIds: string[] };

export type NamedExerciseFixture = {
    id: string;
    type: 'exercise';
    format: 'multiple-choice' | 'fill-in-the-blank' | 'free-text';
    title: string;
    question: string;
    referenceAnswer: string;
    explanation: string;
    semantics: Record<string, unknown>;
    sourceBindings: NamedExerciseSourceBinding[];
    choices?: { id: string; text: string }[];
    correctChoiceId?: string;
    parts?: (
        | { kind: 'text'; text: string }
        | {
              kind: 'gap';
              id: string;
              acceptedAnswers: string[];
          }
    )[];
    acceptedAnswers?: string[];
};

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
    language?: string | undefined;
    explanationLanguage?: string | undefined;
}): NamedExerciseFixture {
    const activity = getExerciseActivity(input.activityId);
    const binding = sourceBinding(input.activityId, input.sources);
    const language = input.language ?? 'fr';
    const explanationLanguage = input.explanationLanguage ?? 'en';
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
    const semantics: Record<string, unknown> = {
        activity: { id: activity.id, version: activity.version },
        objective: `Practise ${activity.id} from the selected source.`,
        language,
        explanationLanguage,
        format: activity.format,
    };
    const common = {
        id: randomUUID(),
        type: 'exercise' as const,
        format: activity.format,
        title: `${activity.id} fixture`,
        question,
        referenceAnswer: answer,
        explanation: `Fixture explanation for ${activity.id}.`,
        semantics,
        sourceBindings: [binding],
    };
    const rubric = {
        criteria: [
            {
                dimension: 'task-completion',
                requirement: 'Complete the requested task.',
            },
            {
                dimension: 'meaning',
                requirement: 'Preserve the source meaning.',
            },
            ...(activity.category === 'reading'
                ? [
                      {
                          dimension: 'evidence',
                          requirement: 'Use source evidence.',
                      },
                  ]
                : activity.category === 'vocabulary' ||
                    activity.category === 'grammar'
                  ? [
                        {
                            dimension: 'target-use',
                            requirement: 'Use the target accurately.',
                        },
                    ]
                  : []),
        ],
    };

    if (activity.format === 'multiple-choice') {
        const correctChoiceId = randomUUID();
        const choices =
            activity.id === 'R03'
                ? [
                      { id: correctChoiceId, text: 'True' },
                      { id: randomUUID(), text: 'False' },
                      { id: randomUUID(), text: 'Not stated' },
                  ]
                : [
                      { id: correctChoiceId, text: answer },
                      { id: randomUUID(), text: 'incorrect answer' },
                  ];

        semantics.checking = {
            policy: 'prepared-key',
            key: {
                kind: 'choice',
                correctChoiceId,
                ...(activity.id === 'R03'
                    ? {
                          classification: {
                              roles: choices.map((choice, index) => ({
                                  choiceId: choice.id,
                                  role: ['true', 'false', 'not-stated'][index]!,
                              })),
                          },
                      }
                    : {}),
                explanations: choices.map((choice) => ({
                    choiceId: choice.id,
                    explanation: `Why ${choice.text} is ${choice.id === correctChoiceId ? 'correct' : 'incorrect'}.`,
                })),
            },
        };

        return { ...common, choices, correctChoiceId };
    }

    if (activity.format === 'fill-in-the-blank') {
        const gapId = randomUUID();
        semantics.checking = {
            policy: activity.checkingPolicy,
            key: {
                kind: 'gaps',
                gaps: [
                    {
                        gapId,
                        acceptedAnswers: [answer],
                        explanation: 'The source supports this answer.',
                    },
                ],
            },
            ...(activity.checkingPolicy === 'hybrid' ? { rubric } : {}),
        };

        return {
            ...common,
            parts: [
                { kind: 'text', text: 'Complete the source-based sentence: ' },
                { kind: 'gap', id: gapId, acceptedAnswers: [answer] },
            ],
        };
    }

    semantics.checking =
        activity.checkingPolicy === 'ai-rubric'
            ? { policy: 'ai-rubric', rubric }
            : {
                  policy: 'hybrid',
                  key: { kind: 'text', acceptedAnswers: [answer] },
                  rubric,
              };

    return {
        ...common,
        ...(activity.checkingPolicy === 'hybrid'
            ? { acceptedAnswers: [answer] }
            : {}),
    };
}
